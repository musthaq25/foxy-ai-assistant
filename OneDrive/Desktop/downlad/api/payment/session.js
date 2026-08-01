const createSessionHandler = require('../create-session.js');

module.exports = async (req, res) => {
  return createSessionHandler(req, res);
};
