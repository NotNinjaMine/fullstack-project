// UC-03 — AI-1 natural-language input
// This component only sends the sentence to the backend and hands the parsed
// fields back to ApplyLeave for pre-filling. The parsing/LLM service itself is
// owned by the AI teammate; this UI never decides anything on its own and the
// employee always reviews the form before submitting.
import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Chip, Stack } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import http from '../http';
import { toast } from 'react-toastify';

function AiLeaveInput({ onParsed }) {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [confidence, setConfidence] = useState(null);

    const handleParse = () => {
        const sentence = text.trim();
        if (!sentence) {
            toast.error('Type a sentence first, e.g. "annual leave next Mon to Wed"');
            return;
        }
        setLoading(true);
        setConfidence(null);
        http.post('/ai/parse-leave', { text: sentence })
            .then((res) => {
                const parsed = res.data;
                setConfidence(parsed.confidence);
                if (typeof onParsed === 'function') {
                    onParsed(parsed);
                }
                toast.info('Draft filled in below — please review before submitting.');
            })
            .catch(() => {
                toast.error('Could not understand that. Please fill the form manually.');
            })
            .finally(() => {
                setLoading(false);
            });
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AutoAwesomeIcon fontSize="small" sx={{ mr: 1 }} color="primary" />
                <Typography variant="subtitle1">Describe your leave in plain English</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                e.g. &quot;I want annual leave from next Monday to Wednesday for a family trip&quot;
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                    fullWidth size="small" autoComplete="off"
                    placeholder="Type your request..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleParse(); }}
                />
                <Button variant="contained" onClick={handleParse} disabled={loading}
                    sx={{ whiteSpace: 'nowrap' }}>
                    {loading ? 'Reading...' : 'Fill form'}
                </Button>
            </Stack>
            {confidence !== null && (
                <Chip
                    size="small"
                    sx={{ mt: 1 }}
                    color={confidence >= 0.7 ? 'success' : 'warning'}
                    label={`AI confidence: ${Math.round(confidence * 100)}% — check the fields`}
                />
            )}
        </Paper>
    );
}

export default AiLeaveInput;
