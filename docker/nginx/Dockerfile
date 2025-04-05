FROM nginx:1.25-alpine

# Create directory for Laravel public files and set permissions
RUN mkdir -p /var/www/public && \
    chown -R nginx:nginx /var/www/public && \
    chmod -R 755 /var/www/public

# Copy Laravel public files
COPY --chown=nginx:nginx public /var/www/public

# Copy Nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Change ownership of the Nginx configuration
RUN chown -R nginx:nginx /etc/nginx/conf.d && \
    chmod -R 755 /etc/nginx/conf.d

# Set default environment variables for service discovery
ENV PHP_SERVICE_HOST=localhost \
    PHP_SERVICE_PORT=9000

# Expose port 80
EXPOSE 80

# Switch to non-root user
USER nginx

# Start Nginx
CMD ["nginx", "-g", "daemon off;"] 