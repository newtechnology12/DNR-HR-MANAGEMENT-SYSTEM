export type ReportType = 'daily' | 'weekly' | 'monthly' | 'other';

export interface Report {
  id: string;
  staffId: string;
  name: string;
  type: ReportType;
  date: string;
  description: string;
  fileUrl: string;
  fileType: 'doc' | 'sheet' | 'pdf' | 'other';
}

