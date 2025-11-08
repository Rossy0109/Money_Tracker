const request = require('supertest');
const app = require('./index'); // Assuming your express app is exported from index.js

describe('GET /', () => {
  it('responds with a 200 status code', (done) => {
    request(app)
      .get('/')
      .expect(200, done);
  });
});
