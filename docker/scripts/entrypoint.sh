#!/bin/bash
# NOTE: We don't use 'set -e' because we want the container to keep running
# even if Shopware installation or other initialization steps fail.
# The web server should start regardless so users can debug issues.

# =============================================================================
# PHP VERSION SWITCHING
# =============================================================================

# Use PHP_VERSION from environment, fallback to DEFAULT_PHP_VERSION
PHP_VERSION="${PHP_VERSION:-${DEFAULT_PHP_VERSION:-8.3}}"

echo "[Swocker] Starting Shopware ${SHOPWARE_VERSION}..."
echo "[Swocker] Variant: ${VARIANT:-dev}"
echo "[Swocker] Requested PHP version: ${PHP_VERSION}"

# Validate PHP version is supported by this Shopware version
SUPPORTED_VERSIONS="${SUPPORTED_PHP_VERSIONS:-8.2,8.3}"
IS_SUPPORTED=false

IFS=',' read -ra SUPPORTED_ARRAY <<< "$SUPPORTED_VERSIONS"
for supported_version in "${SUPPORTED_ARRAY[@]}"; do
    supported_version=$(echo "$supported_version" | xargs) # trim whitespace
    if [ "$PHP_VERSION" = "$supported_version" ]; then
        IS_SUPPORTED=true
        break
    fi
done

if [ "$IS_SUPPORTED" = false ]; then
    echo "[Swocker] ERROR: PHP ${PHP_VERSION} is not supported by Shopware ${SHOPWARE_VERSION}"
    echo "[Swocker] Supported PHP versions: ${SUPPORTED_VERSIONS}"
    echo "[Swocker] Please set PHP_VERSION to one of the supported versions"
    exit 1
fi

# Validate PHP version is installed
if [ ! -f "/usr/bin/php${PHP_VERSION}" ]; then
    echo "[Swocker] ERROR: PHP ${PHP_VERSION} is not installed in this container"
    echo "[Swocker] Available PHP versions:"
    ls -1 /usr/bin/php[0-9]* 2>/dev/null || echo "  None found"
    exit 1
fi

echo "[Swocker] Using PHP ${PHP_VERSION}"

# Switch CLI tools using update-alternatives
update-alternatives --set php "/usr/bin/php${PHP_VERSION}" > /dev/null 2>&1 || true
update-alternatives --set phar "/usr/bin/phar${PHP_VERSION}" > /dev/null 2>&1 || true
update-alternatives --set phar.phar "/usr/bin/phar.phar${PHP_VERSION}" > /dev/null 2>&1 || true
update-alternatives --set phpize "/usr/bin/phpize${PHP_VERSION}" 2>/dev/null || true
update-alternatives --set php-config "/usr/bin/php-config${PHP_VERSION}" 2>/dev/null || true

# Configure web server based on variant
if [ "$VARIANT" = "dev" ] || [ "$VARIANT" = "prod" ]; then
    # Apache variant - switch Apache PHP module
    echo "[Swocker] Configuring Apache for PHP ${PHP_VERSION}..."

    # Disable all PHP modules
    a2dismod php8.2 php8.3 2>/dev/null || true

    # Enable target PHP module
    a2enmod "php${PHP_VERSION}"

elif [ "$VARIANT" = "dev-nginx" ] || [ "$VARIANT" = "prod-nginx" ]; then
    # Nginx variant - switch PHP-FPM service
    echo "[Swocker] Configuring Nginx/PHP-FPM for PHP ${PHP_VERSION}..."

    # Stop all PHP-FPM services
    service php8.2-fpm stop 2>/dev/null || true
    service php8.3-fpm stop 2>/dev/null || true

    # Configure PHP-FPM to listen on the standard port
    sed -i "s|listen = .*|listen = 127.0.0.1:9000|g" /etc/php/${PHP_VERSION}/fpm/pool.d/www.conf 2>/dev/null || true

    # Start selected PHP-FPM version
    service "php${PHP_VERSION}-fpm" start
fi

# Verify PHP version
echo "[Swocker] PHP version: $(php -v | head -n 1)"

# =============================================================================
# FIX TMPFS OWNERSHIP
# =============================================================================
# When tmpfs is mounted (e.g., /var/www/html/var), it gets root:root ownership
# by default, even with mode=1777. This prevents www-data from writing files.
# Fix ownership if the directory is owned by root.

if [ -d "/var/www/html/var" ] && [ "$(stat -c '%U' /var/www/html/var)" = "root" ]; then
    echo "[Swocker] Fixing tmpfs ownership for /var/www/html/var..."
    chown -R www-data:www-data /var/www/html/var
    echo "[Swocker] Ownership fixed: $(stat -c '%U:%G' /var/www/html/var)"
fi

# Re-run composer install if PHP version differs from build-time default
if [ "$PHP_VERSION" != "${DEFAULT_PHP_VERSION}" ]; then
    echo "[Swocker] PHP version ${PHP_VERSION} differs from build default ${DEFAULT_PHP_VERSION}"
    echo "[Swocker] Re-installing Composer dependencies for PHP ${PHP_VERSION}..."

    cd /var/www/html

    # Run composer install with the selected PHP version
    # Use --no-scripts to avoid running post-install scripts that might expect a full setup
    # Use --no-interaction to avoid any prompts
    if su -s /bin/bash www-data -c "composer install --no-scripts --no-interaction --optimize-autoloader" 2>&1 | grep -v "Generating optimized autoload files"; then
        echo "[Swocker] Composer dependencies re-installed successfully"
    else
        echo "[Swocker] WARNING: Composer install had some issues, but continuing..."
    fi
else
    echo "[Swocker] Using build-time dependencies (PHP ${DEFAULT_PHP_VERSION})"
fi

# Configure SSL if enabled (dev variant only)
if [ "$SSL_ENABLED" = "1" ]; then
    echo "[Swocker] Configuring SSL/HTTPS..."

    # Generate self-signed certificate if it doesn't exist
    if [ ! -f "/etc/ssl/certs/swocker.crt" ]; then
        echo "[Swocker] Generating self-signed SSL certificate..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/ssl/private/swocker.key \
            -out /etc/ssl/certs/swocker.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>&1 | grep -v "writing"

        chmod 600 /etc/ssl/private/swocker.key
        chmod 644 /etc/ssl/certs/swocker.crt
        echo "[Swocker] SSL certificate generated"
    fi

    # Configure web server for SSL
    if [ "$VARIANT" = "dev-nginx" ] || [ "$VARIANT" = "prod-nginx" ]; then
        echo "[Swocker] Configuring Nginx for SSL..."
        cat > /etc/nginx/sites-available/shopware-ssl.conf <<'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    ssl_certificate /etc/ssl/certs/swocker.crt;
    ssl_certificate_key /etc/ssl/private/swocker.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/html/public;
    index index.php;

    location ~ /(\.)|^/\. {
        deny all;
    }

    location ~* ^.+\.(?:css|cur|js|jpe?g|gif|ico|png|svg|webp|avif|html|woff|woff2|xml)$ {
        expires 1y;
        add_header Cache-Control "public, must-revalidate, proxy-revalidate, immutable";
        access_log off;
    }

    location / {
        try_files $uri /index.php$is_args$args;
    }

    location ~ ^/(index|shopware-installer\.phar)\.php(/|$) {
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass 127.0.0.1:9000;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_param HTTPS on;
        fastcgi_buffers 8 16k;
        fastcgi_buffer_size 32k;
        fastcgi_read_timeout 300s;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name _;
    return 301 https://$host$request_uri;
}
EOF
        rm -f /etc/nginx/sites-enabled/shopware.conf
        ln -sf /etc/nginx/sites-available/shopware-ssl.conf /etc/nginx/sites-enabled/shopware-ssl.conf
    else
        # Apache SSL configuration
        echo "[Swocker] Configuring Apache for SSL..."
        a2enmod ssl
        cat > /etc/apache2/sites-available/000-default-ssl.conf <<'EOF'
<VirtualHost *:443>
    ServerName localhost
    DocumentRoot /var/www/html/public

    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/swocker.crt
    SSLCertificateKeyFile /etc/ssl/private/swocker.key

    <Directory /var/www/html/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
EOF
        # Enable redirect from HTTP to HTTPS
        cat > /etc/apache2/sites-available/000-default.conf <<'EOF'
<VirtualHost *:80>
    ServerName localhost
    Redirect permanent / https://localhost/
</VirtualHost>
EOF
        a2ensite 000-default-ssl
    fi

    echo "[Swocker] SSL configuration complete"
fi

# Configure Xdebug if enabled (only in dev variants)
if [[ "$VARIANT" == "dev"* ]] && [ "$XDEBUG_ENABLED" = "1" ]; then
    echo "[Swocker] Enabling Xdebug..."

    # Write Xdebug config to all SAPIs (CLI, Apache/FPM)
    # This ensures Xdebug works with both web requests and CLI commands
    for sapi_dir in cli apache2 fpm; do
        XDEBUG_CONF="/etc/php/${PHP_VERSION}/${sapi_dir}/conf.d/zz-xdebug-runtime.ini"
        if [ -d "/etc/php/${PHP_VERSION}/${sapi_dir}/conf.d" ]; then
            cat > "$XDEBUG_CONF" <<EOF
[xdebug]
xdebug.mode=debug
xdebug.start_with_request=yes
xdebug.client_host=\${XDEBUG_CLIENT_HOST:-host.docker.internal}
xdebug.client_port=\${XDEBUG_CLIENT_PORT:-9003}
xdebug.idekey=\${XDEBUG_IDEKEY:-PHPSTORM}
xdebug.log=/tmp/xdebug.log
xdebug.log_level=7
EOF
        fi
    done
elif [[ "$VARIANT" == "dev"* ]]; then
    echo "[Swocker] Xdebug is installed but disabled (set XDEBUG_ENABLED=1 to enable)"
fi

# Configure PHP settings from environment variables
# Use zz- prefix to ensure these files are read after base configuration
# Determine config paths based on variant
if [ "$VARIANT" = "dev-nginx" ] || [ "$VARIANT" = "prod-nginx" ]; then
    PHP_CONF_DIRS="/etc/php/${PHP_VERSION}/fpm/conf.d /etc/php/${PHP_VERSION}/cli/conf.d"
else
    PHP_CONF_DIRS="/etc/php/${PHP_VERSION}/apache2/conf.d /etc/php/${PHP_VERSION}/cli/conf.d"
fi

if [ -n "$PHP_MEMORY_LIMIT" ]; then
    echo "[Swocker] Setting PHP memory_limit to ${PHP_MEMORY_LIMIT}"
    for conf_dir in $PHP_CONF_DIRS; do
        echo "memory_limit = ${PHP_MEMORY_LIMIT}" > "${conf_dir}/zz-memory-limit.ini"
    done
fi

if [ -n "$PHP_UPLOAD_MAX_FILESIZE" ]; then
    echo "[Swocker] Setting PHP upload_max_filesize to ${PHP_UPLOAD_MAX_FILESIZE}"
    for conf_dir in $PHP_CONF_DIRS; do
        echo "upload_max_filesize = ${PHP_UPLOAD_MAX_FILESIZE}" > "${conf_dir}/zz-upload-max-filesize.ini"
    done
fi

if [ -n "$PHP_POST_MAX_SIZE" ]; then
    echo "[Swocker] Setting PHP post_max_size to ${PHP_POST_MAX_SIZE}"
    for conf_dir in $PHP_CONF_DIRS; do
        echo "post_max_size = ${PHP_POST_MAX_SIZE}" > "${conf_dir}/zz-post-max-size.ini"
    done
fi

if [ -n "$PHP_MAX_EXECUTION_TIME" ]; then
    echo "[Swocker] Setting PHP max_execution_time to ${PHP_MAX_EXECUTION_TIME}"
    for conf_dir in $PHP_CONF_DIRS; do
        echo "max_execution_time = ${PHP_MAX_EXECUTION_TIME}" > "${conf_dir}/zz-max-execution-time.ini"
    done
fi

# Wait for database if DATABASE_HOST is set
if [ -n "$DATABASE_HOST" ]; then
    echo "[Swocker] Database host configured, checking connectivity..."
    /usr/local/bin/wait-for-db.sh

    # Generate Shopware .env file
    echo "[Swocker] Configuring Shopware environment..."

    # Set defaults
    APP_ENV="${APP_ENV:-dev}"
    APP_SECRET="${APP_SECRET:-$(openssl rand -hex 32)}"
    INSTANCE_ID="${INSTANCE_ID:-$(openssl rand -hex 16)}"
    APP_URL="${APP_URL:-http://localhost}"

    # Database configuration
    DB_HOST="${DATABASE_HOST}"
    DB_PORT="${DATABASE_PORT:-3306}"
    DB_USER="${DATABASE_USER:-root}"
    DB_PASSWORD="${DATABASE_PASSWORD:-}"
    DB_NAME="${DATABASE_NAME:-shopware}"

    # Build DATABASE_URL
    if [ -n "$DB_PASSWORD" ]; then
        DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    else
        DATABASE_URL="mysql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    fi

    # Admin user configuration
    ADMIN_USER="${SHOPWARE_ADMIN_USER:-admin}"
    ADMIN_PASSWORD="${SHOPWARE_ADMIN_PASSWORD:-shopware}"
    ADMIN_EMAIL="${SHOPWARE_ADMIN_EMAIL:-admin@example.com}"
    ADMIN_FIRSTNAME="${SHOPWARE_ADMIN_FIRSTNAME:-Admin}"
    ADMIN_LASTNAME="${SHOPWARE_ADMIN_LASTNAME:-User}"

    # Create .env file
    cat > /var/www/html/.env <<EOF
APP_ENV=${APP_ENV}
APP_SECRET=${APP_SECRET}
APP_URL=${APP_URL}
DATABASE_URL=${DATABASE_URL}
INSTANCE_ID=${INSTANCE_ID}
COMPOSER_HOME=/tmp/composer
SHOPWARE_HTTP_CACHE_ENABLED=0
SHOPWARE_HTTP_DEFAULT_TTL=7200
BLUE_GREEN_DEPLOYMENT=0
EOF

    # Check if Shopware is already installed
    if [ ! -f "/var/www/html/install.lock" ]; then
        echo "[Swocker] Installing Shopware for the first time..."

        # Run installation
        su -s /bin/bash www-data -c "bin/console system:install --create-database --basic-setup --force"

        # Create admin user
        echo "[Swocker] Creating admin user..."
        su -s /bin/bash www-data -c "bin/console user:create --admin --email='${ADMIN_EMAIL}' --firstName='${ADMIN_FIRSTNAME}' --lastName='${ADMIN_LASTNAME}' --password='${ADMIN_PASSWORD}' '${ADMIN_USER}'" || echo "[Swocker] Admin user might already exist"

        # Create install lock file
        touch /var/www/html/install.lock
        chown www-data:www-data /var/www/html/install.lock

        # Install demo data if requested
        if [ "$INSTALL_DEMO_DATA" = "1" ]; then
            echo "[Swocker] Installing demo data..."
            if su -s /bin/bash www-data -c "bin/console framework:demodata"; then
                echo "[Swocker] Demo data installed successfully"
            else
                echo "[Swocker] WARNING: Failed to install demo data (command might not be available)"
            fi
        fi

        echo "[Swocker] Shopware installation complete!"
    else
        echo "[Swocker] Shopware already installed, running migrations..."
        su -s /bin/bash www-data -c "bin/console system:update:finish" || true
    fi

    # Clear cache
    echo "[Swocker] Clearing cache..."
    su -s /bin/bash www-data -c "bin/console cache:clear"

    # Auto-install plugins if AUTO_INSTALL_PLUGINS is set
    if [ -n "$AUTO_INSTALL_PLUGINS" ]; then
        echo "[Swocker] Auto-installing plugins: ${AUTO_INSTALL_PLUGINS}"

        # Refresh plugin list
        echo "[Swocker] Refreshing plugin list..."
        su -s /bin/bash www-data -c "bin/console plugin:refresh"

        # Split plugins by comma and install each one
        IFS=',' read -ra PLUGINS <<< "$AUTO_INSTALL_PLUGINS"
        for plugin in "${PLUGINS[@]}"; do
            # Trim whitespace
            plugin=$(echo "$plugin" | xargs)

            if [ -n "$plugin" ]; then
                echo "[Swocker] Installing and activating plugin: ${plugin}"
                if su -s /bin/bash www-data -c "bin/console plugin:install --activate ${plugin}"; then
                    echo "[Swocker] Successfully installed plugin: ${plugin}"
                else
                    echo "[Swocker] WARNING: Failed to install plugin: ${plugin}"
                fi
            fi
        done

        # Clear cache after plugin installation
        echo "[Swocker] Clearing cache after plugin installation..."
        su -s /bin/bash www-data -c "bin/console cache:clear"
    fi
else
    echo "[Swocker] No database configured, skipping Shopware installation"
fi

echo "[Swocker] Container ready!"

# Execute the main command (apache2-foreground)
exec "$@"
