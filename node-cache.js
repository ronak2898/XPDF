"use strict";
const NodeCache = require("node-cache");
const nc = new NodeCache();

module.exports = {
  setCache: function (key, value) {
    return nc.set(key, value, 900); // 900 seconds = 15 minutes
  },
  getCache: function (key) {
    return nc.get(key) || false;
  },
  deleteCache: function (key) {
    return nc.del(key);
  },
  flushAllCache: function () {
    return nc.flushAll();
  },
};
