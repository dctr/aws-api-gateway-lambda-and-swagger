const chai = require('chai');
const index = require('../index').handler;

const expect = chai.expect;

describe('index', () => {
  it('should succeed', (done) => {
    index(undefined, undefined, (error, result) => {
      expect(result).to.equal('hello world');
      done(error, result);
    });
  });
});
