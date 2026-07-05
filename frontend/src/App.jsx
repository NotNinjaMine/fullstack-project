import './App.css';
import { useState, useEffect } from 'react';
import { Container, AppBar, Toolbar, Typography, Box, Button } from '@mui/material';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import MyTheme from './themes/MyTheme';
import Dashboard from './pages/Dashboard';
import ApplyLeave from './pages/ApplyLeave';
import LeaveCalendar from './pages/LeaveCalendar';
import Login from './pages/Login';
import http from './http';
import UserContext from './contexts/UserContext';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (localStorage.getItem("accessToken")) {
      http.get('/user/auth')
        .then((res) => setUser(res.data.user))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location = "/";
  };

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      <Router>
        <ThemeProvider theme={MyTheme}>
          <AppBar position="static" className="AppBar">
            <Container>
              <Toolbar disableGutters={true}>
                <Link to="/">
                  <Typography variant="h6" component="div">
                    Leave Management
                  </Typography>
                </Link>
                {user && (
                  <>
                    <Link to="/"><Typography>Dashboard</Typography></Link>
                    <Link to="/apply"><Typography>Apply Leave</Typography></Link>
                    <Link to="/calendar"><Typography>Calendar</Typography></Link>
                  </>
                )}
                <Box sx={{ flexGrow: 1 }}></Box>
                {user && (
                  <>
                    <Typography>{user.name}</Typography>
                    <Button onClick={logout}>Logout</Button>
                  </>
                )}
                {!user && (
                  <Link to="/login"><Typography>Login</Typography></Link>
                )}
              </Toolbar>
            </Container>
          </AppBar>

          <Container>
            <Routes>
              <Route path={"/"} element={<Dashboard />} />
              <Route path={"/apply"} element={<ApplyLeave />} />
              <Route path={"/calendar"} element={<LeaveCalendar />} />
              <Route path={"/login"} element={<Login />} />
            </Routes>
          </Container>
        </ThemeProvider>
      </Router>
    </UserContext.Provider>
  );
}

export default App;
