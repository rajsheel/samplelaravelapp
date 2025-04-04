FROM nginx:1.25-alpine

# Copy the Nginx configuration
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy the Laravel application files
COPY public /var/www/public

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"] 