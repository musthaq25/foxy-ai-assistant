const verifyPaymentSessionHandler = require('../../verify-payment-session.js');

module.exports = async (req, res) => {
  return verifyPaymentSessionHandler(req, res);
};
