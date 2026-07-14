import { useState, useRef } from 'react';
import { FileText, Upload, Trash2, Download, Loader2, Search, Eye, User } from 'lucide-react';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, toast } from '@platform/ui';
import {
  useDocumentList,
  useDocumentUpload,
  useDocumentDelete,
  useDocumentDownloadUrl,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type DocumentCategory,
  type StudentDocument,
} from '../hooks/useDocuments.js';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StudentDocument['status'] }) {
  const colors: Record<StudentDocument['status'], string> = {
    pending_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    approved:       'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
    rejected:       'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300',
    expired:        'bg-gray-100   text-gray-700   dark:bg-gray-800/50   dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE');
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

function UploadDialog({ open, onClose }: UploadDialogProps) {
  const upload = useDocumentUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  function reset() {
    setStudentId('');
    setCategory('other');
    setDescription('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit() {
    if (!file || !studentId.trim()) {
      toast({ title: 'Fyll i elev-ID och välj en fil', variant: 'destructive' });
      return;
    }
    try {
      await upload.mutateAsync({
        student_id: studentId.trim(),
        category,
        file,
        ...(description ? { description } : {}),
      });
      toast({ title: 'Dokument laddat upp' });
      reset();
      onClose();
    } catch (err) {
      toast({ title: 'Uppladdning misslyckades', description: String(err), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ladda upp dokument</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Elev-ID *</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="UUID för eleven"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Kategori</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            >
              {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((k) => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Beskrivning</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Valfri anteckning"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Fil *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
              className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Avbryt</Button>
          <Button onClick={handleSubmit} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Ladda upp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const [search, setSearch]           = useState('');
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const getDownloadUrl = useDocumentDownloadUrl();
  const deleteDoc = useDocumentDelete();
  const { data: docs = [], isLoading } = useDocumentList();

  const filtered = docs.filter((d) => {
    if (!search) return true;
    const q          = search.toLowerCase();
    const studentName = d.students ? `${d.students.first_name} ${d.students.last_name}`.toLowerCase() : '';
    return (
      d.file_name.toLowerCase().includes(q) ||
      CATEGORY_LABELS[d.category].toLowerCase().includes(q) ||
      studentName.includes(q)
    );
  });

  async function handlePreview(doc: StudentDocument) {
    try {
      const url = await getDownloadUrl(doc.storage_path);
      if (doc.mime_type?.startsWith('image/')) {
        setPreviewName(doc.file_name);
        setPreviewUrl(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      toast({ title: 'Kan inte förhandsgranska', variant: 'destructive' });
    }
  }

  async function handleDownload(doc: StudentDocument) {
    try {
      const url = await getDownloadUrl(doc.storage_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      a.click();
    } catch {
      toast({ title: 'Kunde inte hämta fil', variant: 'destructive' });
    }
  }

  async function handleDelete(doc: StudentDocument) {
    setDeletingId(doc.id);
    try {
      await deleteDoc.mutateAsync({ id: doc.id, studentId: doc.student_id });
      toast({ title: 'Dokument borttaget' });
    } catch (err) {
      toast({ title: 'Borttagning misslyckades', description: String(err), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Dokumentarkiv"
        description="Elevdokument och uppladdade filer"
        actions={
          <PermissionGate permission="documents:document:create">
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Ladda upp
            </Button>
          </PermissionGate>
        }
      />

      <PageContent>
        <PermissionGate
          permission="documents:document:read"
          fallback={
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Du har inte behörighet att visa dokument.</p>
            </div>
          }
        >
          {/* Search bar */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Sök på filnamn, kategori eller elev…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-foreground">Inga dokument hittades</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search ? 'Prova en annan sökning.' : 'Ladda upp det första dokumentet med knappen ovan.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Filnamn</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Elev</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kategori</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Storlek</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uppladdad</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {filtered.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-foreground">{doc.file_name}</span>
                        </div>
                        {doc.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{doc.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {doc.students ? (
                          <span className="flex items-center gap-1.5 text-sm text-foreground">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {doc.students.first_name} {doc.students.last_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{CATEGORY_LABELS[doc.category]}</td>
                      <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatBytes(doc.file_size_bytes)}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(doc.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Förhandsgranska"
                            onClick={() => void handlePreview(doc)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ladda ned"
                            onClick={() => handleDownload(doc)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <PermissionGate permission="documents:document:delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ta bort"
                              disabled={deletingId === doc.id}
                              onClick={() => handleDelete(doc)}
                            >
                              {deletingId === doc.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4 text-destructive" />}
                            </Button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PermissionGate>
      </PageContent>

      <PermissionGate permission="documents:document:create">
        <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      </PermissionGate>

      {/* Image preview modal */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm font-medium">{previewName}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="flex justify-center">
              <img src={previewUrl} alt={previewName} className="max-h-[60vh] w-full rounded object-contain" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewUrl(null)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
