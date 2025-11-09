# Swocker

Modern, flexible Shopware 6 Docker images - a better alternative to dockware.

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

Inspired by dockware, built for modern Docker workflows.
