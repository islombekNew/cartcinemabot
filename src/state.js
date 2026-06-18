// Multi-step flow holati (in-memory)
const store = new Map();
module.exports = {
  get: (id) => store.get(id),
  set: (id, v) => store.set(id, v),
  clear: (id) => store.delete(id),
};
