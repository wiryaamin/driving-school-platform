import type { Json } from './database.types.js';
import type {
  PayrollRunStatusEnum,
  PayrollRunTypeEnum,
  TaxRemittanceStatusEnum,
  AgiExportStatusEnum,
  RegulatoryExportTypeEnum,
  RegulatoryExportStatusEnum,
} from './database.types.js';

export type { PayrollRunStatusEnum, PayrollRunTypeEnum, TaxRemittanceStatusEnum, AgiExportStatusEnum, RegulatoryExportTypeEnum, RegulatoryExportStatusEnum };

export interface PayrollRun {
  id:                      string;
  organizationId:          string;
  financialPeriodId:       string | null;
  runType:                 PayrollRunTypeEnum;
  payPeriodStart:          string;
  payPeriodEnd:            string;
  payDate:                 string;
  status:                  PayrollRunStatusEnum;
  totalGross:              number;
  totalWithheldTax:        number;
  totalEmployerContrib:    number;
  totalNetPay:             number;
  entryCount:              number;
  journalEntryId:          string | null;
  salaryPaymentEntryId:    string | null;
  correctionOfRunId:       string | null;
  notes:                   string | null;
  metadata:                Json;
  createdAt:               string;
  updatedAt:               string;
  createdBy:               string | null;
}

export interface PayrollEntry {
  id:                    string;
  organizationId:        string;
  payrollRunId:          string;
  employeeId:            string;
  instructorId:          string | null;
  grossSalary:           number;
  withheldTax:           number;
  employerContribRate:   number;
  employerContribAmount: number;
  pensionAmount:         number;
  benefitsAmount:        number;
  netPay:                number;
  notes:                 string | null;
  metadata:              Json;
  createdAt:             string;
  updatedAt:             string;
}

export interface TaxRemittance {
  id:                       string;
  organizationId:           string;
  financialPeriodId:        string | null;
  payrollRunId:             string | null;
  declarationPeriodStart:   string | null;
  declarationPeriodEnd:     string | null;
  dueDate:                  string | null;
  withheldTaxAmount:        number;
  employerContribAmount:    number;
  totalAmount:              number;
  status:                   TaxRemittanceStatusEnum;
  clearingEntryId:          string | null;
  paymentEntryId:           string | null;
  paymentDate:              string | null;
  paymentReference:         string | null;
  skatteverketReference:    string | null;
  notes:                    string | null;
  metadata:                 Json;
  createdAt:                string;
  updatedAt:                string;
  createdBy:                string | null;
}

export interface VatClearingRun {
  id:                  string;
  organizationId:      string;
  vatPeriodId:         string | null;
  financialPeriodId:   string | null;
  runDate:             string;
  outputVat25:         number;
  outputVat12:         number;
  outputVat6:          number;
  totalOutputVat:      number;
  totalInputVat:       number;
  netVatPayable:       number;
  status:              TaxRemittanceStatusEnum;
  clearingEntryId:     string | null;
  paymentEntryId:      string | null;
  paymentDate:         string | null;
  paymentReference:    string | null;
  notes:               string | null;
  metadata:            Json;
  createdAt:           string;
  updatedAt:           string;
  createdBy:           string | null;
}

export interface AgiExport {
  id:                    string;
  organizationId:        string;
  financialPeriodId:     string | null;
  payrollRunId:          string | null;
  declarationMonth:      string;
  totalGross:            number;
  totalWithheldTax:      number;
  totalEmployerContrib:  number;
  totalBenefits:         number;
  employeeCount:         number;
  status:                AgiExportStatusEnum;
  contentHash:           string | null;
  submittedAt:           string | null;
  submittedBy:           string | null;
  skatteverketReceipt:   string | null;
  notes:                 string | null;
  metadata:              Json;
  createdAt:             string;
  createdBy:             string | null;
}

export interface AgiExportLine {
  id:              string;
  organizationId:  string;
  agiExportId:     string;
  payrollEntryId:  string;
  employeeId:      string;
  grossSalary:     number;
  withheldTax:     number;
  employerContrib: number;
  benefitsAmount:  number;
  pensionAmount:   number;
  createdAt:       string;
}

export interface RegulatoryAuditExport {
  id:                  string;
  organizationId:      string;
  financialPeriodId:   string | null;
  exportType:          RegulatoryExportTypeEnum;
  exportDate:          string;
  periodStart:         string;
  periodEnd:           string;
  contentHash:         string | null;
  rowCount:            number;
  status:              RegulatoryExportStatusEnum;
  submittedAt:         string | null;
  notes:               string | null;
  metadata:            Json;
  createdAt:           string;
  createdBy:           string | null;
}

export interface PayrollBasRule {
  id:              string;
  organizationId:  string | null;
  eventType:       string;
  debitAccount:    string | null;
  creditAccount:   string | null;
  description:     string | null;
  isActive:        boolean;
  sortOrder:       number;
  createdAt:       string;
}

export interface AgiIntegrityResult {
  agiExportId:     string;
  status:          AgiExportStatusEnum;
  declarationMonth: string;
  lineCount:       number;
  storedHash:      string | null;
  currentHash:     string;
  matches:         boolean;
  integrity:       'verified' | 'tampered';
  verifiedAt:      string;
}

export interface OpeningBalanceValidation {
  valid:          boolean;
  hasEntry:       boolean;
  balanced:       boolean;
  agreesWithPrior: boolean;
  details:        string;
}

export interface PayrollRegisterReport {
  organizationId:  string;
  periodId:        string;
  runCount:        number;
  totalGross:      number;
  totalWithheldTax: number;
  totalNetPay:     number;
  totalEmployerContrib: number;
  employeeCount:   number;
  runs:            PayrollRegisterRunSummary[];
}

export interface PayrollRegisterRunSummary {
  runId:       string;
  runType:     PayrollRunTypeEnum;
  payDate:     string;
  totalGross:  number;
  entryCount:  number;
}
