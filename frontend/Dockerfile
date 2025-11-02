FROM nginx:alpine

# Copy static assets
COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY script.js /usr/share/nginx/html/script.js
COPY ble-proxy-client.js /usr/share/nginx/html/ble-proxy-client.js

# NGINX config to serve frontend and proxy /api to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
