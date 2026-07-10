export const EMPTY_APPLICANT = {
  employee_id: '',
  name: '',
  email: '',
  phone: '',
  job_title: '',
  department: '',
  office_branch: '',
  office_city: '',
  office_country: '',
  country_code: 'SG',
  personal_address: '',
  company_name: '',
  company_address: '',
};

export function applicantFromUser(user) {
  if (!user) return { ...EMPTY_APPLICANT };
  return {
    employee_id: user.employee_id || '',
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    job_title: user.job_title || '',
    department: user.department || '',
    office_branch: user.office_branch || '',
    office_city: user.office_city || '',
    office_country: user.office_country || '',
    country_code: user.country_code || 'SG',
    personal_address: user.address || user.personal_address || '',
    company_name: user.company_name || '',
    company_address: user.company_address || '',
  };
}
