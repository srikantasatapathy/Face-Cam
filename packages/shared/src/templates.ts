import { FieldType, TenantTemplate } from './enums'
import type { FieldDefinition } from './field-schema'

/**
 * Field definitions seeded into a tenant when it is created.
 *
 * These are a starting point only. Once seeded, the rows live in
 * `member_field_definitions` and the org admin can add, remove, reorder and
 * change the required flag on any of them.
 *
 * Platform policy: only `fullName` and `code` are enforced by the platform
 * itself. Nothing here is required by default except the fields that map to
 * those two columns, because many school students have no email or phone and
 * requiring one blocks onboarding.
 */

export const EDUCATION_FIELDS: FieldDefinition[] = [
  {
    key: 'class',
    label: 'Class',
    type: FieldType.TEXT,
    required: false,
    group: 'Academic',
    sortOrder: 10,
    maxLength: 32,
  },
  {
    key: 'section',
    label: 'Section',
    type: FieldType.TEXT,
    required: false,
    group: 'Academic',
    sortOrder: 20,
    maxLength: 16,
  },
  {
    key: 'admissionNumber',
    label: 'Admission Number',
    type: FieldType.TEXT,
    required: false,
    group: 'Academic',
    sortOrder: 30,
    maxLength: 64,
  },
  {
    key: 'academicYear',
    label: 'Academic Year',
    type: FieldType.TEXT,
    required: false,
    group: 'Academic',
    sortOrder: 40,
    maxLength: 16,
  },
  {
    key: 'dateOfBirth',
    label: 'Date of Birth',
    type: FieldType.DATE,
    required: false,
    group: 'Personal',
    sortOrder: 50,
  },
  {
    key: 'gender',
    label: 'Gender',
    type: FieldType.SELECT,
    required: false,
    options: ['Male', 'Female', 'Other'],
    group: 'Personal',
    sortOrder: 60,
  },
  {
    key: 'bloodGroup',
    label: 'Blood Group',
    type: FieldType.SELECT,
    required: false,
    options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    group: 'Personal',
    sortOrder: 70,
  },
  {
    key: 'guardianName',
    label: 'Guardian Name',
    type: FieldType.TEXT,
    required: false,
    group: 'Guardian',
    sortOrder: 80,
    maxLength: 200,
  },
  {
    key: 'guardianPhone',
    label: 'Guardian Phone',
    type: FieldType.PHONE,
    required: false,
    group: 'Guardian',
    sortOrder: 90,
    helpText: 'Used for attendance notifications',
  },
  {
    key: 'address',
    label: 'Address',
    type: FieldType.TEXT,
    required: false,
    group: 'Personal',
    sortOrder: 100,
    maxLength: 500,
  },
]

export const CORPORATE_FIELDS: FieldDefinition[] = [
  {
    key: 'department',
    label: 'Department',
    type: FieldType.TEXT,
    required: false,
    group: 'Employment',
    sortOrder: 10,
    maxLength: 100,
  },
  {
    key: 'designation',
    label: 'Designation',
    type: FieldType.TEXT,
    required: false,
    group: 'Employment',
    sortOrder: 20,
    maxLength: 100,
  },
  {
    key: 'dateOfJoining',
    label: 'Date of Joining',
    type: FieldType.DATE,
    required: false,
    group: 'Employment',
    sortOrder: 30,
  },
  {
    key: 'employmentType',
    label: 'Employment Type',
    type: FieldType.SELECT,
    required: false,
    options: ['Full-time', 'Part-time', 'Contract', 'Intern'],
    group: 'Employment',
    sortOrder: 40,
  },
  {
    key: 'reportingManager',
    label: 'Reporting Manager',
    type: FieldType.TEXT,
    required: false,
    group: 'Employment',
    sortOrder: 50,
    maxLength: 200,
  },
  {
    key: 'workLocation',
    label: 'Work Location',
    type: FieldType.TEXT,
    required: false,
    group: 'Employment',
    sortOrder: 60,
    maxLength: 100,
  },
  {
    key: 'dateOfBirth',
    label: 'Date of Birth',
    type: FieldType.DATE,
    required: false,
    group: 'Personal',
    sortOrder: 70,
  },
  {
    key: 'gender',
    label: 'Gender',
    type: FieldType.SELECT,
    required: false,
    options: ['Male', 'Female', 'Other'],
    group: 'Personal',
    sortOrder: 80,
  },
  {
    key: 'bloodGroup',
    label: 'Blood Group',
    type: FieldType.SELECT,
    required: false,
    options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    group: 'Personal',
    sortOrder: 90,
  },
  {
    key: 'emergencyContact',
    label: 'Emergency Contact',
    type: FieldType.PHONE,
    required: false,
    group: 'Personal',
    sortOrder: 100,
  },
]

export const TEMPLATE_FIELDS: Record<string, FieldDefinition[]> = {
  [TenantTemplate.EDUCATION]: EDUCATION_FIELDS,
  [TenantTemplate.CORPORATE]: CORPORATE_FIELDS,
}

/** Labels used for the member `code` column, which differs per vertical. */
export const TEMPLATE_CODE_LABEL: Record<string, string> = {
  [TenantTemplate.EDUCATION]: 'Roll Number',
  [TenantTemplate.CORPORATE]: 'Employee Code',
}

/** Label used for a member record, which differs per vertical. */
export const TEMPLATE_MEMBER_LABEL: Record<string, { singular: string; plural: string }> = {
  [TenantTemplate.EDUCATION]: { singular: 'Student', plural: 'Students' },
  [TenantTemplate.CORPORATE]: { singular: 'Employee', plural: 'Employees' },
}

export function fieldsForTemplate(template: string): FieldDefinition[] {
  return TEMPLATE_FIELDS[template] ?? []
}
