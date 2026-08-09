import test from "node:test";
import assert from "node:assert/strict";
import {
  decisionMessage,
  decisionToastId,
  publishDecisionToast,
  runSingleFlight,
  submitLeaveDecision,
} from "../src/lib/decisionFeedback.js";

test("final approval uses one stable toast id and one canonical message", () => {
  assert.equal(decisionToastId(73, "APPROVED"), "leave-final-approval-73");
  assert.equal(decisionToastId(73, "APPROVED"), "leave-final-approval-73");
  assert.equal(
    decisionMessage(73, "APPROVED"),
    "REQ-73 fully approved. Employee notified; balance deducted; calendar updated."
  );
});


test("one decision response publishes through exactly one toast channel", () => {
  const calls = [];
  const fakeToast = {
    success(message, options) {
      calls.push({ message, options });
    },
  };

  const result = publishDecisionToast(fakeToast, 73, "APPROVED");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    message: "REQ-73 fully approved. Employee notified; balance deducted; calendar updated.",
    options: { id: "leave-final-approval-73" },
  });
  assert.deepEqual(result, {
    id: "leave-final-approval-73",
    message: "REQ-73 fully approved. Employee notified; balance deducted; calendar updated.",
  });
});



test("one successful decision makes one API call and publishes one toast", async () => {
  const requests = [];
  const toasts = [];
  const httpClient = {
    async put(url, body) {
      requests.push({ url, body });
      return { data: { request: { id: 74, status: "APPROVED" } } };
    },
  };
  const toastApi = {
    success(message, options) {
      toasts.push({ message, options });
    },
  };

  const data = await submitLeaveDecision({
    httpClient,
    toastApi,
    requestId: 74,
    approve: true,
    acknowledgeException: true,
  });

  assert.equal(data.request.status, "APPROVED");
  assert.deepEqual(requests, [{
    url: "/leave/74/decide",
    body: { approve: true, acknowledgeException: true },
  }]);
  assert.deepEqual(toasts, [{
    message: "REQ-74 fully approved. Employee notified; balance deducted; calendar updated.",
    options: { id: "leave-final-approval-74" },
  }]);
});

test("single-flight guard prevents rapid duplicate submissions", async () => {
  const lock = { current: false };
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });

  const first = runSingleFlight(lock, async () => {
    calls += 1;
    await pending;
    return "done";
  });
  const second = runSingleFlight(lock, async () => {
    calls += 1;
    return "duplicate";
  });

  assert.equal(calls, 1);
  assert.deepEqual(await second, { skipped: true, value: undefined });
  release();
  assert.deepEqual(await first, { skipped: false, value: "done" });
  assert.equal(lock.current, false);
});

test("the guard releases after failure so a deliberate retry can proceed", async () => {
  const lock = { current: false };
  await assert.rejects(
    runSingleFlight(lock, async () => {
      throw new Error("temporary failure");
    }),
    /temporary failure/
  );
  assert.equal(lock.current, false);

  const retry = await runSingleFlight(lock, async () => "retried");
  assert.deepEqual(retry, { skipped: false, value: "retried" });
});
