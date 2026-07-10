function success(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

module.exports = { success, fail };
