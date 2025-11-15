# Swocker - Modern Shopware 6 Docker Image
# Multi-stage Dockerfile with runtime PHP version switching

ARG SHOPWARE_VERSION=6.7.4.0
ARG DEFAULT_PHP_VERSION=8.3
ARG SUPPORTED_PHP_VERSIONS="8.2,8.3"

# =============================================================================
# BASE STAGE - Ubuntu with multiple PHP versions
# =============================================================================
FROM ubuntu:22.04 AS base

# Set labels
LABEL maintainer="Ilja Weber"
LABEL org.opencontainers.image.title="Swocker"
LABEL org.opencontainers.image.description="Modern Shopware 6 Docker Image with Runtime PHP Switching"

# Build arguments
ARG SHOPWARE_VERSION
ARG DEFAULT_PHP_VERSION
ARG SUPPORTED_PHP_VERSIONS
ARG DEBIAN_FRONTEND=noninteractive

ENV SHOPWARE_VERSION=${SHOPWARE_VERSION}
ENV DEFAULT_PHP_VERSION=${DEFAULT_PHP_VERSION}
ENV SUPPORTED_PHP_VERSIONS=${SUPPORTED_PHP_VERSIONS}
ENV PHP_VERSION=${DEFAULT_PHP_VERSION}

# Database environment variables (can be overridden)
ENV DATABASE_HOST="" \
    DATABASE_PORT="3306" \
    DATABASE_USER="root" \
    DATABASE_PASSWORD="" \
    DATABASE_NAME="shopware" \
    DB_MAX_RETRIES="30" \
    DB_RETRY_INTERVAL="2"

# Install prerequisites
RUN apt-get update && apt-get install -y \
    software-properties-common \
    ca-certificates \
    gnupg2 \
    curl \
    wget \
    unzip \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Add ondrej/php PPA for multiple PHP versions
RUN add-apt-repository -y ppa:ondrej/php \
    && apt-get update

# Install Apache
RUN apt-get install -y apache2 \
    && rm -rf /var/lib/apt/lists/*

# Install BOTH PHP 8.2 and 8.3 with ALL extensions
RUN apt-get update && apt-get install -y \
    # PHP 8.2 packages
    php8.2 libapache2-mod-php8.2 php8.2-cli php8.2-fpm php8.2-common \
    php8.2-mysql php8.2-zip php8.2-gd php8.2-mbstring \
    php8.2-curl php8.2-xml php8.2-bcmath php8.2-intl \
    php8.2-soap php8.2-opcache php8.2-xsl \
    # PHP 8.3 packages
    php8.3 libapache2-mod-php8.3 php8.3-cli php8.3-fpm php8.3-common \
    php8.3-mysql php8.3-zip php8.3-gd php8.3-mbstring \
    php8.3-curl php8.3-xml php8.3-bcmath php8.3-intl \
    php8.3-soap php8.3-opcache php8.3-xsl \
    # MySQL client
    default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Set up update-alternatives for default PHP version
RUN update-alternatives --set php /usr/bin/php${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phar /usr/bin/phar${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phar.phar /usr/bin/phar.phar${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phpize /usr/bin/phpize${DEFAULT_PHP_VERSION} 2>/dev/null || true \
    && update-alternatives --set php-config /usr/bin/php-config${DEFAULT_PHP_VERSION} 2>/dev/null || true

# Enable default Apache PHP module
RUN a2dismod php8.2 php8.3 mpm_event mpm_worker 2>/dev/null || true \
    && a2enmod php${DEFAULT_PHP_VERSION} mpm_prefork \
    && a2enmod rewrite headers expires \
    && echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Configure PHP for both versions
COPY docker/configs/php/base.ini /etc/php/8.2/apache2/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.2/cli/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.2/fpm/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.3/apache2/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.3/cli/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.3/fpm/conf.d/99-swocker.ini

# Configure Apache vhost
COPY docker/configs/apache/vhost.conf /etc/apache2/sites-available/000-default.conf

# Set working directory
WORKDIR /var/www/html

# Download and install Shopware
RUN curl -fsSL https://github.com/shopware/production/archive/refs/tags/v${SHOPWARE_VERSION}.zip -o shopware.zip \
    && unzip -q shopware.zip \
    && mv template-${SHOPWARE_VERSION}/* . \
    && mv template-${SHOPWARE_VERSION}/.* . 2>/dev/null || true \
    && rm -rf template-${SHOPWARE_VERSION} shopware.zip

# Disable Composer 2.9+ security audit blocking for development/testing
# This allows installing Shopware versions with known vulnerabilities for testing purposes
RUN php -r '$json = json_decode(file_get_contents("composer.json"), true); $json["config"]["audit"]["block-insecure"] = false; file_put_contents("composer.json", json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));'

# Create required directories
RUN mkdir -p \
    /var/www/html/var/cache \
    /var/www/html/var/log \
    /var/www/html/public/media \
    /var/www/html/public/thumbnail \
    /var/www/html/public/sitemap \
    /var/www/html/files

# Set ownership
RUN chown -R www-data:www-data /var/www/html

# Copy scripts
COPY docker/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/scripts/healthcheck.sh /usr/local/bin/healthcheck.sh
COPY docker/scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/healthcheck.sh \
    && chmod +x /usr/local/bin/wait-for-db.sh

# =============================================================================
# DEV VARIANT - Development with Xdebug and dev tools
# =============================================================================
FROM base AS dev

ENV VARIANT=dev

# Install development tools
RUN apt-get update && apt-get install -y \
    git \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for asset building
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Xdebug for both PHP versions
RUN apt-get update && apt-get install -y \
    php8.2-xdebug \
    php8.3-xdebug \
    && rm -rf /var/lib/apt/lists/*

# Copy Xdebug configuration for both versions
COPY docker/configs/php/xdebug.ini /etc/php/8.2/apache2/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.2/cli/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.2/fpm/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.3/apache2/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.3/cli/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.3/fpm/conf.d/99-swocker-xdebug.ini

# Install Composer dependencies with dev packages
USER www-data
RUN composer install --no-interaction --optimize-autoloader
USER root

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["apache2ctl", "-D", "FOREGROUND"]

# =============================================================================
# PROD VARIANT - Optimized production without dev tools
# =============================================================================
FROM base AS prod

ENV VARIANT=prod

# Install Composer dependencies without dev packages
USER www-data
RUN composer install --no-interaction --optimize-autoloader --no-dev
USER root

# Copy production PHP configuration for both versions
COPY docker/configs/php/prod.ini /etc/php/8.2/apache2/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.2/cli/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.2/fpm/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.3/apache2/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.3/cli/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.3/fpm/conf.d/99-swocker-prod.ini

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["apache2ctl", "-D", "FOREGROUND"]

# =============================================================================
# CI VARIANT - CLI-only for continuous integration
# =============================================================================
FROM ubuntu:22.04 AS ci

ARG SHOPWARE_VERSION
ARG DEFAULT_PHP_VERSION
ARG DEBIAN_FRONTEND=noninteractive

ENV SHOPWARE_VERSION=${SHOPWARE_VERSION}
ENV DEFAULT_PHP_VERSION=${DEFAULT_PHP_VERSION}
ENV PHP_VERSION=${DEFAULT_PHP_VERSION}
ENV VARIANT=ci

# Install prerequisites
RUN apt-get update && apt-get install -y \
    software-properties-common \
    ca-certificates \
    gnupg2 \
    curl \
    wget \
    git \
    unzip \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Add ondrej/php PPA
RUN add-apt-repository -y ppa:ondrej/php \
    && apt-get update

# Install both PHP versions CLI only
RUN apt-get update && apt-get install -y \
    # PHP 8.2 packages
    php8.2-cli php8.2-common \
    php8.2-mysql php8.2-zip php8.2-gd php8.2-mbstring \
    php8.2-curl php8.2-xml php8.2-bcmath php8.2-intl \
    php8.2-soap php8.2-opcache php8.2-xsl \
    # PHP 8.3 packages
    php8.3-cli php8.3-common \
    php8.3-mysql php8.3-zip php8.3-gd php8.3-mbstring \
    php8.3-curl php8.3-xml php8.3-bcmath php8.3-intl \
    php8.3-soap php8.3-opcache php8.3-xsl \
    # MySQL client
    default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Set up update-alternatives
RUN update-alternatives --set php /usr/bin/php${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phar /usr/bin/phar${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phar.phar /usr/bin/phar.phar${DEFAULT_PHP_VERSION}

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Configure PHP for both versions
COPY docker/configs/php/base.ini /etc/php/8.2/cli/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.3/cli/conf.d/99-swocker.ini

# Set working directory
WORKDIR /var/www/html

# Download and install Shopware
RUN curl -fsSL https://github.com/shopware/production/archive/refs/tags/v${SHOPWARE_VERSION}.zip -o shopware.zip \
    && unzip -q shopware.zip \
    && mv template-${SHOPWARE_VERSION}/* . \
    && mv template-${SHOPWARE_VERSION}/.* . 2>/dev/null || true \
    && rm -rf template-${SHOPWARE_VERSION} shopware.zip

# Disable Composer 2.9+ security audit blocking for development/testing
# This allows installing Shopware versions with known vulnerabilities for testing purposes
RUN php -r '$json = json_decode(file_get_contents("composer.json"), true); $json["config"]["audit"]["block-insecure"] = false; file_put_contents("composer.json", json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));'

# Install Composer dependencies (with dev for testing tools)
RUN composer install --no-interaction --optimize-autoloader

# Create required directories
RUN mkdir -p \
    /var/www/html/var/cache \
    /var/www/html/var/log \
    /var/www/html/public/media \
    /var/www/html/public/thumbnail \
    /var/www/html/public/sitemap \
    /var/www/html/files

# Copy scripts
COPY docker/scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh

# Default command
CMD ["php", "-v"]

# =============================================================================
# NGINX BASE - Ubuntu with Nginx and PHP-FPM (multiple versions)
# =============================================================================
FROM ubuntu:22.04 AS nginx-base

# Set labels
LABEL maintainer="Ilja Weber"
LABEL org.opencontainers.image.title="Swocker"
LABEL org.opencontainers.image.description="Modern Shopware 6 Docker Image (Nginx) with Runtime PHP Switching"

# Build arguments
ARG SHOPWARE_VERSION
ARG DEFAULT_PHP_VERSION
ARG DEBIAN_FRONTEND=noninteractive

ENV SHOPWARE_VERSION=${SHOPWARE_VERSION}
ENV DEFAULT_PHP_VERSION=${DEFAULT_PHP_VERSION}
ENV PHP_VERSION=${DEFAULT_PHP_VERSION}

# Database environment variables
ENV DATABASE_HOST="" \
    DATABASE_PORT="3306" \
    DATABASE_USER="root" \
    DATABASE_PASSWORD="" \
    DATABASE_NAME="shopware" \
    DB_MAX_RETRIES="30" \
    DB_RETRY_INTERVAL="2"

# Install prerequisites
RUN apt-get update && apt-get install -y \
    software-properties-common \
    ca-certificates \
    gnupg2 \
    curl \
    wget \
    unzip \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Add ondrej/php PPA
RUN add-apt-repository -y ppa:ondrej/php \
    && apt-get update

# Install Nginx and Supervisor
RUN apt-get install -y \
    nginx \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Install both PHP versions with FPM
RUN apt-get update && apt-get install -y \
    # PHP 8.2 packages
    php8.2 php8.2-cli php8.2-fpm php8.2-common \
    php8.2-mysql php8.2-zip php8.2-gd php8.2-mbstring \
    php8.2-curl php8.2-xml php8.2-bcmath php8.2-intl \
    php8.2-soap php8.2-opcache php8.2-xsl \
    # PHP 8.3 packages
    php8.3 php8.3-cli php8.3-fpm php8.3-common \
    php8.3-mysql php8.3-zip php8.3-gd php8.3-mbstring \
    php8.3-curl php8.3-xml php8.3-bcmath php8.3-intl \
    php8.3-soap php8.3-opcache php8.3-xsl \
    # MySQL client
    default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Set up update-alternatives
RUN update-alternatives --set php /usr/bin/php${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phar /usr/bin/phar${DEFAULT_PHP_VERSION} \
    && update-alternatives --set phar.phar /usr/bin/phar.phar${DEFAULT_PHP_VERSION}

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Configure PHP for both versions
COPY docker/configs/php/base.ini /etc/php/8.2/fpm/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.2/cli/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.3/fpm/conf.d/99-swocker.ini
COPY docker/configs/php/base.ini /etc/php/8.3/cli/conf.d/99-swocker.ini

# Configure Nginx
RUN rm -f /etc/nginx/sites-enabled/default
COPY docker/configs/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/configs/nginx/shopware.conf /etc/nginx/sites-available/shopware.conf
RUN ln -s /etc/nginx/sites-available/shopware.conf /etc/nginx/sites-enabled/shopware.conf

# Set working directory
WORKDIR /var/www/html

# Download and install Shopware
RUN curl -fsSL https://github.com/shopware/production/archive/refs/tags/v${SHOPWARE_VERSION}.zip -o shopware.zip \
    && unzip -q shopware.zip \
    && mv template-${SHOPWARE_VERSION}/* . \
    && mv template-${SHOPWARE_VERSION}/.* . 2>/dev/null || true \
    && rm -rf template-${SHOPWARE_VERSION} shopware.zip

# Disable Composer 2.9+ security audit blocking for development/testing
# This allows installing Shopware versions with known vulnerabilities for testing purposes
RUN php -r '$json = json_decode(file_get_contents("composer.json"), true); $json["config"]["audit"]["block-insecure"] = false; file_put_contents("composer.json", json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));'

# Create required directories
RUN mkdir -p \
    /var/www/html/var/cache \
    /var/www/html/var/log \
    /var/www/html/public/media \
    /var/www/html/public/thumbnail \
    /var/www/html/public/sitemap \
    /var/www/html/files

# Set ownership
RUN chown -R www-data:www-data /var/www/html

# Copy scripts
COPY docker/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/scripts/healthcheck.sh /usr/local/bin/healthcheck.sh
COPY docker/scripts/wait-for-db.sh /usr/local/bin/wait-for-db.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/healthcheck.sh \
    && chmod +x /usr/local/bin/wait-for-db.sh

# Configure Supervisor
COPY docker/configs/nginx/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# =============================================================================
# DEV VARIANT (Nginx) - Development with Nginx, Xdebug and dev tools
# =============================================================================
FROM nginx-base AS dev-nginx

ENV VARIANT=dev-nginx

# Install development tools
RUN apt-get update && apt-get install -y \
    git \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Xdebug for both versions
RUN apt-get update && apt-get install -y \
    php8.2-xdebug \
    php8.3-xdebug \
    && rm -rf /var/lib/apt/lists/*

# Copy Xdebug configuration for both versions
COPY docker/configs/php/xdebug.ini /etc/php/8.2/fpm/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.2/cli/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.3/fpm/conf.d/99-swocker-xdebug.ini
COPY docker/configs/php/xdebug.ini /etc/php/8.3/cli/conf.d/99-swocker-xdebug.ini

# Install Composer dependencies with dev packages
USER www-data
RUN composer install --no-interaction --optimize-autoloader
USER root

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# =============================================================================
# PROD VARIANT (Nginx) - Optimized production with Nginx
# =============================================================================
FROM nginx-base AS prod-nginx

ENV VARIANT=prod-nginx

# Install Composer dependencies without dev packages
USER www-data
RUN composer install --no-interaction --optimize-autoloader --no-dev
USER root

# Copy production PHP configuration for both versions
COPY docker/configs/php/prod.ini /etc/php/8.2/fpm/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.2/cli/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.3/fpm/conf.d/99-swocker-prod.ini
COPY docker/configs/php/prod.ini /etc/php/8.3/cli/conf.d/99-swocker-prod.ini

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
# Performance test comment
