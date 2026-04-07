FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Expose port — Railway assigns PORT dynamically at runtime
EXPOSE ${PORT:-3000}

# Start Next.js (PORT is injected by Railway at runtime)
CMD ["npm", "start"]
