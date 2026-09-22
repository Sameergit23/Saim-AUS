# Saim-AUS container image.
# Runs the service via tsx (TypeScript execution). A compiled/bundled slim
# image is a future optimization (see roadmap Phase 7).
FROM node:20-slim

WORKDIR /app

# Install dependencies first for better layer caching. tsx (a devDependency) is
# the runtime, so ALL deps must be installed. --include=dev forces devDependencies
# even when the build sets NODE_ENV=production (as Render does).
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

# Application source
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# Drop privileges to the built-in non-root user.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
