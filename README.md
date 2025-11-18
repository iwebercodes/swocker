# Swocker

Modern, flexible Shopware 6 Docker images optimized for development and production.

## Features

- **Fast startup times** - Optimized for development and production
- **Multiple variants** - dev, prod, ci, and nginx options
- **Highly configurable** - Environment variables for everything
- **Small image sizes** - Optimized layer caching and multi-stage builds
- **SSL support** - Built-in HTTPS for development
- **Plugin auto-installation** - Mount and install plugins automatically
- **Demo data support** - Optional demo data installation
- **Shopware 6.7+** - Support for latest Shopware versions
- **Runtime PHP switching** - Switch between PHP 8.2 and 8.3 without rebuilding

## Quick Start

### Development with Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: shopware
    tmpfs:
      - /var/lib/mysql

  shopware:
    image: iwebercodes/swocker:latest-dev
    ports:
      - '80:80'
    environment:
      DATABASE_HOST: mysql
      DATABASE_PASSWORD: root
      SHOPWARE_ADMIN_USER: admin
      SHOPWARE_ADMIN_PASSWORD: shopware
    volumes:
      - ./custom/plugins:/var/www/html/custom/plugins
    depends_on:
      - mysql
```

Then run:

```bash
docker-compose up
```

Access Shopware at http://localhost and admin at http://localhost/admin

### Single Container

```bash
docker run -p 80:80 \
  -e DATABASE_HOST=mysql \
  -e DATABASE_PASSWORD=root \
  iwebercodes/swocker:latest-dev
```

## Available Tags

All images include PHP 8.2 and 8.3, selectable at runtime via the `PHP_VERSION` environment variable.

**Latest versions:**

- `iwebercodes/swocker:latest` (latest Shopware, dev variant)
- `iwebercodes/swocker:latest-dev`
- `iwebercodes/swocker:latest-prod`
- `iwebercodes/swocker:latest-ci`
- `iwebercodes/swocker:latest-dev-nginx`
- `iwebercodes/swocker:latest-prod-nginx`

**Version-specific:**

- `iwebercodes/swocker:6.7.4.0-dev`
- `iwebercodes/swocker:6.7.4.0-prod`
- `iwebercodes/swocker:6.7.4.0-ci`
- `iwebercodes/swocker:6.7.4.0-dev-nginx`
- `iwebercodes/swocker:6.7.4.0-prod-nginx`

## Variants

Swocker provides multiple variants optimized for different use cases:

### Development Variant (`dev`)

**Image**: `iwebercodes/swocker:latest-dev`

Includes:

- Xdebug (configurable)
- Node.js and npm
- Development tools (git, vim, composer)
- Apache or Nginx web server

**Use for**: Local development, debugging

### Production Variant (`prod`)

**Image**: `iwebercodes/swocker:latest-prod`

Includes:

- Optimized PHP settings (Opcache enabled)
- No development dependencies
- Smaller image size
- Security headers configured

**Use for**: Production deployments, staging

### CI Variant (`ci`)

**Image**: `iwebercodes/swocker:latest-ci`

Includes:

- CLI-only (no web server)
- PHPUnit and PHPStan
- Minimal size for fast pulls
- Testing tools

**Use for**: Continuous integration, automated testing

### Nginx Variants

For Nginx instead of Apache, use `-nginx` suffix:

- `iwebercodes/swocker:latest-dev-nginx`
- `iwebercodes/swocker:latest-prod-nginx`

## Environment Variables

### Database Configuration

| Variable            | Default          | Description                                       |
| ------------------- | ---------------- | ------------------------------------------------- |
| `DATABASE_HOST`     | (required)       | MySQL/MariaDB hostname                            |
| `DATABASE_PORT`     | `3306`           | Database port                                     |
| `DATABASE_USER`     | `root`           | Database username                                 |
| `DATABASE_PASSWORD` | (empty)          | Database password                                 |
| `DATABASE_NAME`     | `shopware`       | Database name                                     |
| `DATABASE_URL`      | (auto-generated) | Full database URL (overrides individual settings) |

### Shopware Configuration

| Variable                   | Default             | Description                         |
| -------------------------- | ------------------- | ----------------------------------- |
| `APP_ENV`                  | `dev`               | Application environment (dev, prod) |
| `APP_SECRET`               | (auto-generated)    | Application secret key              |
| `APP_URL`                  | `http://localhost`  | Application URL                     |
| `SHOPWARE_ADMIN_USER`      | `admin`             | Admin username                      |
| `SHOPWARE_ADMIN_PASSWORD`  | `shopware`          | Admin password                      |
| `SHOPWARE_ADMIN_EMAIL`     | `admin@example.com` | Admin email                         |
| `SHOPWARE_ADMIN_FIRSTNAME` | `Admin`             | Admin first name                    |
| `SHOPWARE_ADMIN_LASTNAME`  | `User`              | Admin last name                     |

### PHP Configuration

| Variable                  | Default | Description                     |
| ------------------------- | ------- | ------------------------------- |
| `PHP_VERSION`             | `8.3`   | PHP version to use (8.2 or 8.3) |
| `PHP_MEMORY_LIMIT`        | `512M`  | PHP memory limit                |
| `PHP_UPLOAD_MAX_FILESIZE` | `128M`  | Maximum upload file size        |
| `PHP_POST_MAX_SIZE`       | `128M`  | Maximum POST size               |
| `PHP_MAX_EXECUTION_TIME`  | `300`   | Maximum execution time          |

#### Runtime PHP Version Switching

All Swocker images include both PHP 8.2 and PHP 8.3. You can switch between them at runtime using the `PHP_VERSION` environment variable:

```yaml
# Use PHP 8.2
services:
  shopware:
    image: iwebercodes/swocker:latest-dev
    environment:
      PHP_VERSION: "8.2"
      DATABASE_HOST: mysql

# Use PHP 8.3 (default)
services:
  shopware:
    image: iwebercodes/swocker:latest-dev
    environment:
      PHP_VERSION: "8.3"  # or omit for default
      DATABASE_HOST: mysql
```

**Benefits:**

- Test compatibility across PHP versions without rebuilding
- Switch PHP versions by simply restarting the container
- Ideal for testing and development workflows

**Note:** If `PHP_VERSION` is not specified, the image defaults to PHP 8.3.

### Development Features

| Variable             | Default                | Description                                   |
| -------------------- | ---------------------- | --------------------------------------------- |
| `XDEBUG_ENABLED`     | `0`                    | Enable Xdebug (dev variant only)              |
| `XDEBUG_CLIENT_HOST` | `host.docker.internal` | Xdebug client host                            |
| `XDEBUG_CLIENT_PORT` | `9003`                 | Xdebug client port                            |
| `SSL_ENABLED`        | `0`                    | Enable SSL/HTTPS with self-signed certificate |
| `INSTALL_DEMO_DATA`  | `0`                    | Install demo data on first startup            |

### Plugin Management

| Variable               | Default | Description                                     |
| ---------------------- | ------- | ----------------------------------------------- |
| `AUTO_INSTALL_PLUGINS` | (empty) | Comma-separated list of plugins to auto-install |

Example:

```yaml
environment:
  AUTO_INSTALL_PLUGINS: 'SwagExample,MyCustomPlugin'
volumes:
  - ./plugins/SwagExample:/var/www/html/custom/plugins/SwagExample
  - ./plugins/MyCustomPlugin:/var/www/html/custom/plugins/MyCustomPlugin
```

### Hook Configuration

| Variable               | Default | Description                                         |
| ---------------------- | ------- | --------------------------------------------------- |
| `POST_HEALTHY_TIMEOUT` | `300`   | Max seconds to wait for container to become healthy |

### Custom Initialization Hook Scripts

Swocker supports custom initialization scripts that execute automatically at specific container lifecycle stages. This allows you to automate configuration, data imports, and other setup tasks without manual intervention.

#### Hook Directories

- **`/docker-entrypoint-init.d/`** - System-level initialization scripts (runs as root, before database operations)
- **`/docker-entrypoint-shopware.d/`** - Shopware initialization scripts (runs as `www-data`, after Shopware installation)

#### Usage

Mount your hook scripts as volumes in docker-compose.yml:

```yaml
services:
  shopware:
    image: iwebercodes/swocker:latest-dev
    volumes:
      - ./init-scripts:/docker-entrypoint-shopware.d:ro
    environment:
      DATABASE_HOST: mysql
      DATABASE_PASSWORD: root
```

#### Script Requirements

- Scripts must have `.sh` extension
- Scripts execute in alphabetical order (use numbered prefixes like `10-`, `20-` to control order)
- Scripts run with `bash -e` (fail-fast mode)
- Container startup fails if any hook script exits with non-zero status
- Scripts should be idempotent (safe to run multiple times)

#### Example: Configure Plugin Settings

```bash
#!/bin/bash
set -e

echo "[Hook] Configuring Stripe plugin..."

# Configure plugin via system_config table
mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
INSERT INTO system_config (id, configuration_key, configuration_value, sales_channel_id, created_at)
VALUES (
    UNHEX(REPLACE(UUID(), '-', '')),
    'StripePlugin.config.apiKey',
    JSON_OBJECT('_value', '$STRIPE_API_KEY'),
    NULL,
    NOW()
)
ON DUPLICATE KEY UPDATE configuration_value = JSON_OBJECT('_value', '$STRIPE_API_KEY');
EOF

echo "[Hook] ✓ Plugin configuration complete"
```

#### Example: Create Sales Channel

```bash
#!/bin/bash
set -e

echo "[Hook] Creating sales channel..."

# Use Shopware console commands
bin/console sales-channel:create \
  --name="B2B Store" \
  --language="English" \
  --currency="EUR"

# Or use direct SQL for more control
mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
-- Your SQL statements here
EOF

echo "[Hook] ✓ Sales channel created"
```

#### Example: Import Demo Data

```bash
#!/bin/bash
set -e

echo "[Hook] Importing demo products..."

# Import via Shopware CLI
bin/console framework:demodata --products=100

# Or import from CSV/JSON
bin/console import:products /data/products.csv

echo "[Hook] ✓ Demo data imported"
```

For more examples, see [`examples/init-scripts/`](examples/init-scripts/).

#### Best Practices

- Use numbered prefixes (`10-`, `20-`, `30-`) to control execution order
- Mount scripts as read-only (`:ro`) for security
- Use `ON DUPLICATE KEY UPDATE` in SQL for idempotency
- Validate required environment variables at the start of scripts
- Log script progress with clear messages
- Test scripts in development before using in production

### Post-Healthy Initialization Hooks

Post-healthy hooks execute **after** the container passes health checks and the application is fully operational. These are ideal for tasks that require Shopware to be ready to serve HTTP requests.

#### When to Use Post-Healthy Hooks vs Regular Hooks

| Feature               | Regular Hooks          | Post-Healthy Hooks        |
| --------------------- | ---------------------- | ------------------------- |
| **Execution timing**  | During startup         | After health check passes |
| **Application state** | Installing/configuring | Fully operational         |
| **HTTP requests**     | Not reliable           | ✓ Reliable                |
| **Failure behavior**  | Container exits        | ✓ Log warning, continue   |
| **Use case**          | Critical setup         | Optional integrations     |

#### Hook Directory

- **`/docker-entrypoint-shopware-healthy.d/`** - Post-healthy scripts (runs as `www-data`, after container becomes healthy)

#### Usage

```yaml
services:
  shopware:
    image: iwebercodes/swocker:latest-dev
    volumes:
      - ./post-healthy-scripts:/docker-entrypoint-shopware-healthy.d:ro
    environment:
      DATABASE_HOST: mysql
      DATABASE_PASSWORD: root
      POST_HEALTHY_TIMEOUT: '300' # Optional: max seconds to wait for healthy (default: 300)
```

#### Key Differences from Regular Hooks

1. **Non-Fatal Failures**: Hook failures are logged but don't crash the container
2. **Application Ready**: Shopware can serve HTTP requests and process API calls
3. **Timing**: Executes 60-90 seconds after container start (after health checks pass)

#### Example: Webhook Registration

```bash
#!/bin/bash
set -e

echo "[Hook] Registering webhook with payment provider..."

# Hook implements own timeout for external service call
timeout 30 curl -X POST "https://payment-provider.com/api/webhooks" \
    -H "Authorization: Bearer ${PAYMENT_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${SHOP_URL}/api/webhook/payment\",\"events\":[\"payment.completed\"]}" \
    || {
        echo "[Hook] ⚠ Webhook registration failed (timeout or error)"
        echo "[Hook] This is non-critical, continuing..."
        exit 0  # Non-fatal failure
    }

echo "[Hook] ✓ Webhook registered successfully"
```

#### Example: Product Feed Distribution

```bash
#!/bin/bash
set -e

echo "[Hook] Pushing product feed to marketplace..."

# Download feed from Shopware (requires application ready)
curl -o /tmp/products.xml "http://localhost/feed/products.xml" \
    --retry 3 --retry-delay 2

# Push to external marketplace
curl -X POST "https://marketplace.com/api/import" \
    -H "Authorization: Bearer ${MARKETPLACE_API_KEY}" \
    -F "feed=@/tmp/products.xml" \
    --max-time 120

echo "[Hook] ✓ Product feed uploaded successfully"
```

For more examples, see [`examples/init-scripts/post-healthy/`](examples/init-scripts/post-healthy/).

#### Monitoring Hook Execution

**Check if hooks completed:**

```bash
docker logs <container-name> 2>&1 | grep "post-healthy"
```

**Wait for hooks in docker-compose:**

```yaml
services:
  shopware:
    image: iwebercodes/swocker:latest-dev
    healthcheck:
      test: test -f /tmp/.swocker-post-healthy-complete
      interval: 5s
      timeout: 3s
      retries: 60
      start_period: 120s

  tests:
    depends_on:
      shopware:
        condition: service_healthy # Waits for hooks to complete
```

#### Troubleshooting

**Hooks not executing:**

```bash
# 1. Check if directory is mounted
docker exec <container-name> ls -la /docker-entrypoint-shopware-healthy.d/

# 2. Check monitor started
docker logs <container-name> 2>&1 | grep "Post-healthy hook monitor started"

# 3. Check if container became healthy
docker inspect <container-name> | grep -A 10 "Health"
```

**Hook failures:**

```bash
# Find failed hooks
docker logs <container-name> 2>&1 | grep "⚠"

# Test hook manually
docker exec -u www-data <container-name> bash -c \
  "cd /var/www/html && bash /docker-entrypoint-shopware-healthy.d/10-webhook.sh"
```

## Examples

### Development with Xdebug

```yaml
services:
  shopware:
    image: ghcr.io/ilja/swocker:6.7-php8.2-dev
    environment:
      XDEBUG_ENABLED: 1
      XDEBUG_CLIENT_HOST: host.docker.internal
    ports:
      - '80:80'
```

### Production with SSL

```yaml
services:
  shopware:
    image: ghcr.io/ilja/swocker:6.7-php8.2-prod
    environment:
      SSL_ENABLED: 1
      APP_ENV: prod
    ports:
      - '80:80'
      - '443:443'
```

### Custom Plugin Development

```yaml
services:
  shopware:
    image: ghcr.io/ilja/swocker:6.7-php8.2-dev
    environment:
      AUTO_INSTALL_PLUGINS: 'MyPlugin'
    volumes:
      - ./plugins/MyPlugin:/var/www/html/custom/plugins/MyPlugin
```

### CI/CD Testing

```yaml
test:
  image: ghcr.io/ilja/swocker:6.7-php8.2-ci
  command: vendor/bin/phpunit
  volumes:
    - ./:/var/www/html
```

### Custom Initialization Hooks

Swocker supports custom initialization scripts that automatically execute at specific container lifecycle stages. This allows you to configure plugins, create sales channels, import data, and more without manual intervention.

#### Hook Points

1. **`/docker-entrypoint-init.d/`** - Pre-initialization scripts
   - Executes before Shopware initialization
   - Runs as root user
   - Use for system-level setup

2. **`/docker-entrypoint-shopware.d/`** - Shopware initialization scripts
   - Executes after Shopware is installed and configured
   - Runs as `www-data` user in `/var/www/html`
   - Use for Shopware configuration, plugin setup, data import

#### Usage

Mount your custom scripts to the appropriate hook directory:

```yaml
services:
  shopware:
    image: ghcr.io/ilja/swocker:6.7-php8.2-dev
    volumes:
      - ./init-scripts:/docker-entrypoint-shopware.d:ro
```

Scripts are executed alphabetically. Use numbered prefixes to control execution order:

```bash
init-scripts/
├── 10-configure-plugin.sh
├── 20-create-sales-channels.sh
└── 30-import-data.sh
```

#### Example: Configure Plugin After Installation

```bash
#!/bin/bash
set -e

echo "Configuring payment plugin..."

# Configure via database
mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
INSERT INTO system_config (id, configuration_key, configuration_value, created_at)
VALUES (
    UNHEX(REPLACE(UUID(), '-', '')),
    'PaymentPlugin.config.apiKey',
    JSON_OBJECT('_value', '${PAYMENT_API_KEY}'),
    NOW()
)
ON DUPLICATE KEY UPDATE configuration_value = JSON_OBJECT('_value', '${PAYMENT_API_KEY}');
EOF

echo "✓ Plugin configured"
```

#### Important Notes

- Scripts must start with `#!/bin/bash` and use `set -e` for error handling
- If any script fails, the container stops to prevent misconfiguration
- Scripts should be idempotent (safe to run multiple times)
- All container environment variables are available to scripts
- Scripts have full access to Shopware CLI via `bin/console`

See `examples/init-scripts/` for more comprehensive examples including:

- Payment provider integration (Stripe)
- Sales channel creation
- Custom data import

## Performance Optimization

### Use tmpfs for MySQL

For significantly faster database operations during development:

```yaml
services:
  mysql:
    image: mysql:8.0
    tmpfs:
      - /var/lib/mysql:rw,noexec,nosuid,size=1g
```

This stores the database in RAM, providing 10-50x faster database operations. Data is lost on container restart, which is perfect for development.

### Volume Mounting Best Practices

For better performance on macOS/Windows:

```yaml
volumes:
  # Only mount what you need
  - ./custom/plugins:/var/www/html/custom/plugins

  # Use delegated mode for better performance
  - ./custom/plugins:/var/www/html/custom/plugins:delegated
```

### Docker Build Cache

The Dockerfile is optimized for layer caching:

- System dependencies are installed first
- Composer dependencies are installed before application code
- Multi-stage builds minimize final image size

## Version Support

### Shopware Versions

Swocker supports Shopware 6.7.0.0 and later. Each version is tagged:

- `6.7-php8.2-dev` - Latest 6.7.x
- `6.7.4.0-php8.2-dev` - Specific version
- `latest-dev` - Latest available version

## Building Locally

```bash
# Build dev variant
docker build --target dev -t swocker:dev .

# Build with specific versions
docker build \
  --build-arg PHP_VERSION=8.2 \
  --build-arg SHOPWARE_VERSION=6.7.4.0 \
  --target dev \
  -t swocker:custom .

# Build nginx variant
docker build --target dev-nginx -t swocker:dev-nginx .
```

## Health Checks

All variants include comprehensive health checks:

- Web server process status (Apache/Nginx/PHP-FPM)
- Database connectivity
- HTTP response validation

Health check logs can be viewed:

```bash
docker inspect <container-id> | jq '.[0].State.Health'
```

## Troubleshooting

### Container fails to start

Check logs:

```bash
docker logs <container-id>
```

Common issues:

- Database not accessible: Verify `DATABASE_HOST` and network configuration
- Port conflicts: Change port mapping (`-p 8080:80`)
- Permission issues: Check volume mount permissions

### Shopware installation fails

Ensure:

- Database is running and accessible
- Database credentials are correct
- Sufficient memory allocated to container

### Performance issues

- Use tmpfs for MySQL data directory
- Ensure adequate CPU/memory resources
- Check Docker Desktop resource limits (macOS/Windows)

## Architecture

```
swocker/
├── docker/
│   ├── Dockerfile           # Multi-stage Dockerfile
│   ├── configs/
│   │   ├── apache/          # Apache configurations
│   │   ├── nginx/           # Nginx configurations
│   │   └── php/             # PHP configurations
│   └── scripts/
│       ├── entrypoint.sh    # Container entrypoint
│       ├── healthcheck.sh   # Health check script
│       └── wait-for-db.sh   # Database wait script
├── scripts/                 # Build and utility scripts
├── tests/                   # Automated tests
└── versions.json           # Supported versions
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: https://github.com/ilja/swocker/issues
- Documentation: https://github.com/ilja/swocker/wiki

## Acknowledgments

Built for modern Docker workflows.
