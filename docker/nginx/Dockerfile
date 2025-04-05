FROM nginx:1.25-alpine

# Create directory for Laravel public files and set permissions
RUN mkdir -p /var/www/public && \
    chown -R www-data:www-data /var/www/public && \
    chmod -R 755 /var/www/public

# Copy Laravel public files
COPY --chown=www-data:www-data public /var/www/public

# Copy Nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Change ownership of the Nginx configuration
RUN chown -R www-data:www-data /etc/nginx/conf.d && \
    chmod -R 755 /etc/nginx/conf.d

# Expose port 80
EXPOSE 80

# Switch to non-root user
USER www-data

# Start Nginx
CMD ["nginx", "-g", "daemon off;"] 