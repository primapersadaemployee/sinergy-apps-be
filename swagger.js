import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sinergy Apps API',
      version: '1.0.0',
      description: 'Dokumentasi API Sinergy Apps',
    },
    servers: [
      {
        url: 'http://localhost:4000', // ganti dengan URL deployment kamu jika sudah online
      },
    ],
  },
  apis: ['./routes/*.js'], // lokasi file route yang ingin kamu dokumentasikan
};

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};

export default setupSwagger;
