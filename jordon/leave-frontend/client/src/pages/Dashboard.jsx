// UC-08 — Employee Dashboard
import React, { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import {
    Box, Typography, Grid, Card, CardContent, Button, Chip, Divider, CircularProgress
} from '@mui/material';
import http from '../http';
import dayjs from 'dayjs';
import UserContext from '../contexts/UserContext';

const statusColor = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
    cancelled: 'default'
};

function BalanceCard({ label, value }) {
    return (
        <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="h4">{value}</Typography>
            </CardContent>
        </Card>
    );
}

function Dashboard() {
    const { user, loading } = useContext(UserContext);
    const [balance, setBalance] = useState(null);
    const [requests, setRequests] = useState([]);

    useEffect(() => {
        if (!user) return;
        http.get('/leave/balance')
            .then((res) => setBalance(res.data))
            .catch(() => { /* handled globally */ });
        http.get('/leave/mine')
            .then((res) => setRequests(res.data))
            .catch(() => { /* handled globally */ });
    }, [user]);

    if (loading) {
        return (
            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!user) {
        return (
            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Please log in to view your dashboard.
                </Typography>
                <Link to="/login">
                    <Button variant="contained">Login</Button>
                </Link>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, my: 2 }}>
                <Typography variant="h5" sx={{ flexGrow: 1 }}>
                    Welcome, {user.name}
                </Typography>
                <Link to="/apply">
                    <Button variant="contained">Apply for Leave</Button>
                </Link>
            </Box>

            {/* Balance summary */}
            {balance && (
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={6} sm={4} md={2.4}>
                        <BalanceCard label="Entitled" value={balance.entitled} />
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                        <BalanceCard label="Carried Forward" value={balance.carriedForward} />
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                        <BalanceCard label="Taken" value={balance.taken} />
                    </Grid>
                    <Grid item xs={6} sm={4} md={2.4}>
                        <BalanceCard label="Pending" value={balance.pending} />
                    </Grid>
                    <Grid item xs={12} sm={4} md={2.4}>
                        <BalanceCard label="Available" value={balance.available} />
                    </Grid>
                </Grid>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" sx={{ mb: 1 }}>My Requests</Typography>

            {requests.length === 0 && (
                <Typography color="text.secondary">
                    No leave requests yet.
                </Typography>
            )}

            <Grid container spacing={2}>
                {requests.map((r) => (
                    <Grid item xs={12} md={6} lg={4} key={r.id}>
                        <Card variant="outlined">
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                                        {r.leaveType}
                                    </Typography>
                                    <Chip size="small"
                                        label={r.status}
                                        color={statusColor[r.status] || 'default'} />
                                </Box>
                                <Typography variant="body2" color="text.secondary">
                                    {dayjs(r.startDate).format('D MMM YYYY')} &ndash; {dayjs(r.endDate).format('D MMM YYYY')}
                                    {' '}({r.workingDays} day{r.workingDays === 1 ? '' : 's'})
                                </Typography>
                                {r.reason && (
                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                        {r.reason}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}

export default Dashboard;
