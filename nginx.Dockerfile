# Nginx Dockerfile for Laravel application
# This Dockerfile creates a container image for serving the Laravel application with Nginx

# Use the official Nginx image as the base
FROM nginx:1.25-alpine

# Install required packages
# - curl: For health checks
# - bash: For shell scripts
RUN apk add --no-cache curl bash

# Create directory for Laravel public files
# This directory will be used by Nginx to serve the Laravel application
RUN mkdir -p /var/www/public

# Copy Laravel public files to the Nginx container
# These files include the index.php and other public assets
COPY public /var/www/public

# Copy Nginx configuration
# This configuration file defines how Nginx should serve the Laravel application
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Expose port 80
# This port will be used by the container to accept HTTP requests
EXPOSE 80

# Start Nginx
# This command starts the Nginx web server in the foreground
CMD ["nginx", "-g", "daemon off;"] 