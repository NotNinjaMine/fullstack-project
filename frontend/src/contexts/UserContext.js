import { createContext } from 'react';

const UserContext = createContext({
  user: null,
  setUser: () => {},
  loading: true
});

export default UserContext;
