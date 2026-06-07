const { getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');
const {
  canonicalMoneyOtpContext,
  startSmsOtp,
  verifySmsOtp,
} = require('../smsOtp');

async function startMoneySmsOtp(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const purpose = String(body.purpose || '').trim().toLowerCase();
  const context = canonicalMoneyOtpContext({
    purpose,
    amount: body.amount,
    currency: body.currency,
    network: body.network || body.pay_currency,
    receiverUserId: body.receiver_user_id || body.recipient_id,
  });
  const response = await startSmsOtp({ user, purpose, context, requestContext });
  sendJson(res, 200, response);
}

async function verifyMoneySmsOtp(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const purpose = String(body.purpose || '').trim().toLowerCase();
  const context = canonicalMoneyOtpContext({
    purpose,
    amount: body.amount,
    currency: body.currency,
    network: body.network || body.pay_currency,
    receiverUserId: body.receiver_user_id || body.recipient_id,
  });
  const response = await verifySmsOtp({
    user,
    purpose,
    context,
    code: body.code,
    firebaseIdToken: body.firebase_id_token || body.firebaseIdToken,
    smsOtpChallenge: body.sms_otp_challenge || body.smsOtpChallenge,
    requestContext,
  });
  sendJson(res, 200, response);
}

module.exports = {
  startMoneySmsOtp,
  verifyMoneySmsOtp,
};
