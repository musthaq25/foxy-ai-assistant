const verifySessionHandler = require('../../verify-session.js');

module.exports = async (req, res) => {
  return verifySessionHandler(req, res);
};
