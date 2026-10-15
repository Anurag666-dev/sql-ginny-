# SQL Ginny Frontend Dockerfile
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production server using light nginx or serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Custom nginx configuration for SPA client routing
RUN echo 'server { \
    listen 5173; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
