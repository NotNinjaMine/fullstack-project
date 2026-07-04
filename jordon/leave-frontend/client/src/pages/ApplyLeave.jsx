// UC-03 — Apply for Leave
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Grid, Alert,
    FormControl, InputLabel, FormHelperText, Select, MenuItem
} from '@mui/material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import dayjs from 'dayjs';
import http from '../http';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import AiLeaveInput from '../components/AiLeaveInput';

// Rough client-side estimate (excludes weekends only). The backend computes the
// authoritative figure, excluding the employee's country public holidays.
function estimateWorkingDays(start, end) {
    if (!start || !end || !start.isValid() || !end.isValid()) return 0;
    if (end.isBefore(start, 'day')) return 0;
    let days = 0;
    let cursor = start.startOf('day');
    const last = end.startOf('day');
    while (!cursor.isAfter(last, 'day')) {
        const dow = cursor.day(); // 0 = Sun, 6 = Sat
        if (dow !== 0 && dow !== 6) days += 1;
        cursor = cursor.add(1, 'day');
    }
    return days;
}

function ApplyLeave() {
    const navigate = useNavigate();
    const [leaveTypes, setLeaveTypes] = useState([]);

    useEffect(() => {
        http.get('/leave/types')
            .then((res) => setLeaveTypes(res.data))
            .catch(() => toast.error('Could not load leave types.'));
    }, []);

    const formik = useFormik({
        initialValues: {
            leaveTypeId: '',
            startDate: dayjs().add(1, 'day'),
            endDate: dayjs().add(1, 'day'),
            reason: ''
        },
        validationSchema: yup.object({
            leaveTypeId: yup.string().required('Leave type is required'),
            startDate: yup.date().typeError('Invalid date').required('Start date is required'),
            endDate: yup.date().typeError('Invalid date').required('End date is required')
                .min(yup.ref('startDate'), 'End date cannot be before start date'),
            reason: yup.string().trim()
                .min(3, 'Reason must be at least 3 characters')
                .max(500, 'Reason must be at most 500 characters')
                .required('Reason is required')
        }),
        onSubmit: (data) => {
            const payload = {
                leaveTypeId: data.leaveTypeId,
                startDate: data.startDate.format('YYYY-MM-DD'),
                endDate: data.endDate.format('YYYY-MM-DD'),
                reason: data.reason.trim()
            };
            http.post('/leave', payload)
                .then(() => {
                    toast.success('Leave request submitted.');
                    navigate('/');
                })
                .catch((err) => {
                    toast.error(`${err.response?.data?.message || 'Submission failed'}`);
                });
        }
    });

    // Called by the AI-1 box: map parsed fields onto the form for the user to review.
    const applyAiParsed = (parsed) => {
        if (parsed.leaveTypeCode) {
            const match = leaveTypes.find((t) => t.code === parsed.leaveTypeCode);
            if (match) formik.setFieldValue('leaveTypeId', match.id);
        }
        if (parsed.startDate) formik.setFieldValue('startDate', dayjs(parsed.startDate));
        if (parsed.endDate) formik.setFieldValue('endDate', dayjs(parsed.endDate));
        if (parsed.reason) formik.setFieldValue('reason', parsed.reason);
    };

    const workingDays = estimateWorkingDays(formik.values.startDate, formik.values.endDate);

    return (
        <Box>
            <Typography variant="h5" sx={{ my: 2 }}>
                Apply for Leave
            </Typography>

            {/* UC-03: AI-1 natural-language input */}
            <AiLeaveInput onParsed={applyAiParsed} />

            <Box component="form" onSubmit={formik.handleSubmit}>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth margin="dense"
                            error={formik.touched.leaveTypeId && Boolean(formik.errors.leaveTypeId)}>
                            <InputLabel>Leave Type</InputLabel>
                            <Select label="Leave Type"
                                name="leaveTypeId"
                                value={formik.values.leaveTypeId}
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                            >
                                {leaveTypes.map((t) => (
                                    <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                                ))}
                            </Select>
                            <FormHelperText>
                                {formik.touched.leaveTypeId && formik.errors.leaveTypeId}
                            </FormHelperText>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                            <Alert severity="info" sx={{ width: '100%' }}>
                                Estimated working days: <strong>{workingDays}</strong>
                                <Typography variant="caption" display="block">
                                    Final count is confirmed by the server (excludes public holidays).
                                </Typography>
                            </Alert>
                        </Box>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth margin="dense">
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <DatePicker format="DD/MM/YYYY"
                                    label="Start Date"
                                    value={formik.values.startDate}
                                    onChange={(v) => formik.setFieldValue('startDate', v)}
                                    onClose={() => formik.setFieldTouched('startDate', true)}
                                    slotProps={{
                                        textField: {
                                            error: formik.touched.startDate && Boolean(formik.errors.startDate),
                                            helperText: formik.touched.startDate && formik.errors.startDate
                                        }
                                    }}
                                />
                            </LocalizationProvider>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth margin="dense">
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <DatePicker format="DD/MM/YYYY"
                                    label="End Date"
                                    value={formik.values.endDate}
                                    onChange={(v) => formik.setFieldValue('endDate', v)}
                                    onClose={() => formik.setFieldTouched('endDate', true)}
                                    slotProps={{
                                        textField: {
                                            error: formik.touched.endDate && Boolean(formik.errors.endDate),
                                            helperText: formik.touched.endDate && formik.errors.endDate
                                        }
                                    }}
                                />
                            </LocalizationProvider>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth margin="dense" autoComplete="off"
                            multiline minRows={3}
                            label="Reason"
                            name="reason"
                            value={formik.values.reason}
                            onChange={formik.handleChange}
                            onBlur={formik.handleBlur}
                            error={formik.touched.reason && Boolean(formik.errors.reason)}
                            helperText={formik.touched.reason && formik.errors.reason}
                        />
                    </Grid>
                </Grid>

                <Box sx={{ mt: 2 }}>
                    <Button variant="contained" type="submit">
                        Submit Request
                    </Button>
                </Box>
            </Box>

            <ToastContainer />
        </Box>
    );
}

export default ApplyLeave;
