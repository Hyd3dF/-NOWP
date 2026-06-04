'use strict';

const levels = ['debug', 'info', 'warn', 'error', 'fatal'];
const numeric = Object.fromEntries(levels.map((level, index) => [level, index]));

const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const minLevel = numeric[envLevel] !== undefined ? numeric[envLevel] : numeric.info;

function emit(level, message, fields = {}) {
  if (numeric[level] < minLevel) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || 'oroya-backend',
    pid: process.pid,
    msg: message,
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  debug: (msg, fields) => emit('debug', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
  fatal: (msg, fields) => emit('fatal', msg, fields),
  setLevel: (level) => {
    if (numeric[level] !== undefined) {
      return;
    }
  },
};
