const { randomUUID } = require('node:crypto');

module.exports = function v1() {
  return randomUUID();
};
