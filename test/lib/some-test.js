const chai = require('chai');
const some = require('../../lib/some');

const expect = chai.expect;

describe('some', () => {
  it('should do something', () => {
    expect(some()).to.equal('hello world');
  });
});
