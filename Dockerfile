FROM node:10.17.0-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

EXPOSE 3000
CMD ["npm", "run", "local"]