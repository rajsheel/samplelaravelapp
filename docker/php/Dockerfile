FROM php:8.2-fpm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip

# Clear cache
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# Get latest Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Create a non-root user
RUN useradd -m -s /bin/bash laravel
RUN mkdir -p /var/www/html && chown -R laravel:laravel /var/www/html

# Set working directory
WORKDIR /var/www/html

# Copy existing application directory
COPY . /var/www/html

# Change ownership of the application files to the non-root user
RUN chown -R laravel:laravel /var/www/html

# Switch to non-root user
USER laravel

# Expose port 9000
EXPOSE 9000

# Start PHP-FPM
CMD ["php-fpm"] 