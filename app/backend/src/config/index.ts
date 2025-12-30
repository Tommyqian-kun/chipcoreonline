// This file can be used to export consolidated or computed configuration variables.
// For now, it's kept simple.

const config = {
  port: process.env.PORT || '8080',
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  // other configurations...
};

export default config; 