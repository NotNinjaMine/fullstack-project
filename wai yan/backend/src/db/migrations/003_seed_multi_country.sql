-- ENH-2: baseline policies for all supported offices. Existing local policy edits win.
INSERT INTO leave_policies (country_code, annual_min, annual_max, sick_with_mc, sick_no_mc, carry_forward_max) VALUES
  ('CN', 5, 15, 10, 0, 5),
  ('ID', 12, 12, 12, 0, 5),
  ('JP', 10, 20, 10, 0, 5),
  ('MY', 12, 14, 12, 2, 5),
  ('MM', 10, 14, 10, 0, 5),
  ('NZ', 20, 20, 10, 0, 5),
  ('PH', 5, 15, 10, 0, 5),
  ('SG', 14, 24, 12, 2, 5),
  ('TH', 8, 11, 30, 0, 5),
  ('VN', 12, 14, 12, 2, 5)
ON CONFLICT (country_code) DO NOTHING;
