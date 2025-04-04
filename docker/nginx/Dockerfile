FROM nginx:1.25-alpine

# Create a non-root user
RUN adduser -D -H -u 1000 -s /sbin/nologin www-data

# Create directory for Laravel public files
RUN mkdir -p /var/www/public && chown -R www-data:www-data /var/www/public

# Copy Laravel public files
COPY public /var/www/public

# Copy Nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Change ownership of the Nginx configuration
RUN chown -R www-data:www-data /etc/nginx/conf.d

# Expose port 80
EXPOSE 80

# Switch to non-root user
USER www-data

# Start Nginx
CMD ["nginx", "-g", "daemon off;"] 