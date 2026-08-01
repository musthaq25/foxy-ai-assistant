const verifyPaymentHandler = require('./verify-payment.js');

module.exports = async (req, res) => {
  return verifyPaymentHandler(req, res);
};
