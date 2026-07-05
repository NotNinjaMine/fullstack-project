// UC-09 — Leave Calendar
import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Box, Typography, Button, ToggleButton, ToggleButtonGroup, CircularProgress
} from '@mui/material';
import { Calendar, dayjsLocalizer } from 'react-big-calendar';
import dayjs from 'dayjs';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import http from '../http';
import { toast } from 'react-toastify';
import UserContext from '../contexts/UserContext';

const localizer = dayjsLocalizer(dayjs);

const statusHexColor = {
    pending: '#f9a825',
    approved: '#2e7d32',
    rejected: '#c62828',
    cancelled: '#9e9e9e'
};

function LeaveCalendar() {
    const { user, loading } = useContext(UserContext);
    const [scope, setScope] = useState('mine');
    const [events, setEvents] = useState([]);

    useEffect(() => {
        if (!user) return;
        http.get(`/leave/calendar?scope=${scope}`)
            .then((res) => {
                const mapped = res.data.map((e) => ({
                    id: e.id,
                    // Show whose leave it is in team view.
                    title: scope === 'team' ? `${e.employeeName}: ${e.title}` : e.title,
                    // end date from the API is inclusive; react-big-calendar treats
                    // the end as exclusive, so add a day for all-day events.
                    start: dayjs(e.start).toDate(),
                    end: dayjs(e.end).add(1, 'day').toDate(),
                    allDay: true,
                    status: e.status
                }));
                setEvents(mapped);
            })
            .catch(() => toast.error('Could not load the calendar.'));
    }, [scope, user]);

    const eventPropGetter = (event) => ({
        style: {
            backgroundColor: statusHexColor[event.status] || '#3949ab',
            border: 'none'
        }
    });

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
                    Please log in to view the leave calendar.
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
                    Leave Calendar
                </Typography>
                <ToggleButtonGroup
                    size="small"
                    color="primary"
                    value={scope}
                    exclusive
                    onChange={(e, v) => { if (v) setScope(v); }}
                >
                    <ToggleButton value="mine">My Leave</ToggleButton>
                    <ToggleButton value="team">My Team</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <Box className="leave-calendar-wrapper">
                <Calendar
                    localizer={localizer}
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    views={['month', 'week', 'agenda']}
                    eventPropGetter={eventPropGetter}
                    style={{ height: '100%' }}
                />
            </Box>
        </Box>
    );
}

export default LeaveCalendar;
