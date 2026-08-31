# ==========================================
# Mirage Store - Production Dockerfile
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install dependencies first (leverages Docker layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose server port
EXPOSE 3000

# Run with non-root user for enhanced security
USER node

CMD ["node", "tebex-headless-server.js"]
