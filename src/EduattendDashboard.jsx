import React, { useMemo, useState } from "react";
import {
  LogOut,
  Users,
  CheckCircle2,
  XCircle,
  Download,
  Search,
  UploadCloud,
  LayoutGrid,
  Eraser,
  Shield,
  Plus,
} from "lucide-react";
import "./eduattend.css";

function Pill({ value }) {
  const v = (value ?? "—").toString();
  const tone = v === "P" ? "green" : v === "A" ? "red" : "gray";
  return <span className={`ea-pill ea-pill-${tone}`}>{v}</span>;
}

function chipClass(status) {
  if (status === "present") return "ea-chip ea-chip-green";
  if (status === "absent") return "ea-chip ea-chip-red";
  return "ea-chip ea-chip-gray";
}

function chipText(status) {
  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  return "Unmarked";
}

export default function EduattendDashboard({
  schoolName = "School",
  userRole = "teacher",
  userUid = "",
  userDisplayName = "",
  userSubjects = [],

  blocks = ["Block 1"],
  teachers = [],

  studentsCount = 0,
  presentCount = 0,
  absentCount = 0,

  studentSearch = "",
  setStudentSearch = () => {},

  selectedDate = new Date().toISOString().slice(0, 10),
  setSelectedDate = () => {},

  selectedBlock = "Block 1",
  setSelectedBlock = () => {},

  onExportCSV = () => {},
  onOpenImport = () => {},
  onLogout = () => {},

  tableRows = [],
  studentsRaw = [],
  attendanceRaw = [],
  onMark = () => {},

  // admin
  onAdminCreateInvite = async () => {},
  onAdminBulkAssign = async () => {},
  onAdminBulkUnassign = async () => {},
}) {
  const [activeTab, setActiveTab] = useState(userRole === "admin" ? "attendance" : "attendance");

  // Posting panel list
  const quickList = useMemo(() => {
    const t = (studentSearch || "").trim().toLowerCase();
    const base = t
      ? studentsRaw.filter((s) => (s.name || "").toLowerCase().includes(t))
      : studentsRaw;
    return base.slice(0, 12);
  }, [studentsRaw, studentSearch]);

  const statusFor = (studentId, block) => {
    const rec = attendanceRaw.find((a) => a.studentId === studentId && a.block === block);
    return rec?.status || "unmarked";
  };

  /* =========================
     ADMIN STATE
  ========================= */
  const [inviteTeacherName, setInviteTeacherName] = useState("");
  const [inviteSubjects, setInviteSubjects] = useState("");
  const [lastInvite, setLastInvite] = useState("");

  const [assignBlock, setAssignBlock] = useState("Block 1");
  const [assignTeacherUid, setAssignTeacherUid] = useState("");
  const [assignGroup, setAssignGroup] = useState("all"); // all|prep|sports
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const assignList = useMemo(() => {
    const t = assignSearch.trim().toLowerCase();
    return studentsRaw
      .filter((s) => (assignGroup === "all" ? true : (s.group || "prep") === assignGroup))
      .filter((s) => (!t ? true : (s.name || "").toLowerCase().includes(t)))
      .slice(0, 250);
  }, [studentsRaw, assignGroup, assignSearch]);

  function toggleStudent(id) {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createInvite() {
    const code = await onAdminCreateInvite({ teacherName: inviteTeacherName, subjectsText: inviteSubjects });
    if (code) setLastInvite(code);
  }

  async function bulkAssign() {
    if (!assignTeacherUid || selectedStudentIds.length === 0) return;
    await onAdminBulkAssign({ block: assignBlock, teacherUid: assignTeacherUid, studentIds: selectedStudentIds });
    setSelectedStudentIds([]);
  }

  async function bulkUnassign() {
    if (selectedStudentIds.length === 0) return;
    await onAdminBulkUnassign({ block: assignBlock, studentIds: selectedStudentIds });
    setSelectedStudentIds([]);
  }

  return (
    <div className="ea-page">
      {/* Top bar */}
      <header className="ea-topbar">
        <div className="ea-brand">
          <img className="ea-logoImg" src="/scaLogo.png" alt={schoolName} />
          <div>
            <div className="ea-brandName">{schoolName}</div>
            <div className="ea-brandSub">
              Attendance Console • <span className="ea-badge">{userRole.toUpperCase()}</span>
              {userRole === "teacher" && (
                <span className="ea-muted" style={{ marginLeft: 10 }}>
                  {userDisplayName}
                  {userSubjects?.length ? ` • ${userSubjects.join(", ")}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="ea-topActions">
          {userRole === "admin" && (
            <div className="ea-tabs">
              <button
                className={activeTab === "attendance" ? "ea-tab ea-tabActive" : "ea-tab"}
                onClick={() => setActiveTab("attendance")}
              >
                Attendance
              </button>
              <button
                className={activeTab === "admin" ? "ea-tab ea-tabActive" : "ea-tab"}
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            </div>
          )}

          <button className="ea-btn ea-btnGhost" onClick={onLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="ea-container">
        {/* ===================== Attendance Tab ===================== */}
        {activeTab === "attendance" && (
          <>
            {/* Stats + Export */}
            <section className="ea-rowTop">
              <div className="ea-stats">
                <div className="ea-stat">
                  <div className="ea-statIcon ea-tone-blue">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="ea-statLabel">STUDENTS</div>
                    <div className="ea-statValue">{studentsCount}</div>
                  </div>
                </div>

                <div className="ea-stat">
                  <div className="ea-statIcon ea-tone-green">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div className="ea-statLabel">PRESENT</div>
                    <div className="ea-statValue">{presentCount}</div>
                  </div>
                </div>

                <div className="ea-stat">
                  <div className="ea-statIcon ea-tone-red">
                    <XCircle size={18} />
                  </div>
                  <div>
                    <div className="ea-statLabel">ABSENT</div>
                    <div className="ea-statValue">{absentCount}</div>
                  </div>
                </div>
              </div>

              <button className="ea-btn ea-btnPrimary" onClick={onExportCSV}>
                <Download size={18} />
                <span>EXPORT CSV</span>
              </button>
            </section>

            {/* Filters */}
            <section className="ea-card ea-filters">
              <div className="ea-search">
                <Search size={18} />
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student..."
                />
              </div>

              <div className="ea-filterRight">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="ea-date"
                />

                <select value={selectedBlock} onChange={(e) => setSelectedBlock(e.target.value)} className="ea-select">
                  {blocks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* Matrix + Posting Panel */}
            <section className="ea-grid">
              {/* Matrix (VIEW ONLY) */}
              <div className="ea-card ea-matrix">
                <div className="ea-cardHeader">
                  <div className="ea-cardTitle">
                    <LayoutGrid size={16} />
                    <span>MASTER MATRIX (VIEW ONLY)</span>
                  </div>
                  <div className="ea-muted">{selectedDate}</div>
                </div>

                <div className="ea-tableWrap">
                  <table className="ea-table">
                    <thead>
                      <tr>
                        <th className="ea-thName">STUDENT</th>
                        {blocks.map((b) => (
                          <th key={b} style={{ textAlign: "center" }}>
                            {b.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {tableRows.length === 0 ? (
                        <tr>
                          <td colSpan={1 + blocks.length} className="ea-empty">
                            No students found.
                          </td>
                        </tr>
                      ) : (
                        tableRows.map((row) => (
                          <tr key={row.id}>
                            <td className="ea-tdName">
                              <div className="ea-stuRow">
                                <div className="ea-stuName">{row.name}</div>
                                <div className="ea-stuMeta">{(row.group || "prep").toUpperCase()}</div>
                              </div>
                            </td>

                            {blocks.map((b) => {
                              const current = row.blocks?.[b] ?? "—";
                              return (
                                <td key={b} className="ea-tdCell">
                                  <div className="ea-cellView">
                                    <Pill value={current} />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Posting Panel */}
              <aside className="ea-card ea-panel">
                <div className="ea-panelSection">
                  <div className="ea-panelTitle">
                    <span>POST ATTENDANCE</span>
                    <span className="ea-panelMeta">{selectedBlock}</span>
                  </div>

                  <div className="ea-quickList">
                    {quickList.length === 0 ? (
                      <div className="ea-empty">No matches.</div>
                    ) : (
                      quickList.map((s) => {
                        const st = statusFor(s.id, selectedBlock);
                        return (
                          <div key={s.id} className="ea-quickItem">
                            <div style={{ minWidth: 0 }}>
                              <div className="ea-quickName">{s.name}</div>
                              <div className="ea-quickSub">
                                <span className={chipClass(st)}>{chipText(st)}</span>
                                <span className="ea-quickMeta">{(s.group || "prep").toUpperCase()}</span>
                              </div>
                            </div>

                            <div className="ea-actions">
                              <button
                                className="ea-actionBtn ea-actionBtnPresent"
                                onClick={() => onMark(s.id, selectedBlock, "P")}
                                title="Mark Present"
                              >
                                <CheckCircle2 size={16} />
                              </button>

                              <button
                                className="ea-actionBtn ea-actionBtnAbsent"
                                onClick={() => onMark(s.id, selectedBlock, "A")}
                                title="Mark Absent"
                              >
                                <XCircle size={16} />
                              </button>

                              <button
                                className="ea-actionBtn ea-actionBtnClear"
                                onClick={() => onMark(s.id, selectedBlock, "—")}
                                title="Clear / Unmark"
                              >
                                <Eraser size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="ea-panelSection">
                  <button
                    className="ea-btn ea-btnDark"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={onOpenImport}
                  >
                    <UploadCloud size={18} />
                    OPEN IMPORT TOOL
                  </button>
                </div>
              </aside>
            </section>
          </>
        )}

        {/* ===================== Admin Tab ===================== */}
        {activeTab === "admin" && userRole === "admin" && (
          <section className="ea-adminGrid">
            {/* Create Teacher Invite */}
            <div className="ea-card">
              <div className="ea-cardHeader">
                <div className="ea-cardTitle">
                  <Shield size={16} />
                  <span>CREATE TEACHER INVITE</span>
                </div>
                <div className="ea-muted">Teacher signs up using this code</div>
              </div>

              <div className="ea-adminForm">
                <div className="ea-field">
                  <label>Teacher name</label>
                  <input
                    value={inviteTeacherName}
                    onChange={(e) => setInviteTeacherName(e.target.value)}
                    placeholder="Teacher 1"
                  />
                </div>

                <div className="ea-field">
                  <label>Subjects (comma separated)</label>
                  <input
                    value={inviteSubjects}
                    onChange={(e) => setInviteSubjects(e.target.value)}
                    placeholder="Math, Science, English"
                  />
                </div>

                <button className="ea-btn ea-btnPrimary" onClick={createInvite}>
                  <Plus size={18} />
                  Create Invite
                </button>

                {lastInvite && (
                  <div className="ea-callout">
                    <div className="ea-calloutTitle">Invite Code</div>
                    <div className="ea-calloutCode">{lastInvite}</div>
                    <div className="ea-muted">Give this to the teacher during signup.</div>
                  </div>
                )}
              </div>
            </div>

            {/* Block Assignments */}
            <div className="ea-card">
              <div className="ea-cardHeader">
                <div className="ea-cardTitle">
                  <Users size={16} />
                  <span>BLOCK ASSIGNMENTS</span>
                </div>
                <div className="ea-muted">Bulk assign students to a teacher for a block</div>
              </div>

              <div className="ea-adminForm">
                <div className="ea-adminRow">
                  <div className="ea-field">
                    <label>Block</label>
                    <select value={assignBlock} onChange={(e) => setAssignBlock(e.target.value)}>
                      {blocks.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ea-field ea-grow">
                    <label>Teacher</label>
                    <select value={assignTeacherUid} onChange={(e) => setAssignTeacherUid(e.target.value)}>
                      <option value="">-- choose teacher --</option>
                      {teachers.map((t) => (
                        <option key={t.uid} value={t.uid}>
                          {t.displayName} {t.subjects?.length ? `• ${t.subjects.join(", ")}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="ea-adminRow">
                  <div className="ea-field">
                    <label>Group</label>
                    <select value={assignGroup} onChange={(e) => setAssignGroup(e.target.value)}>
                      <option value="all">All</option>
                      <option value="prep">Prep</option>
                      <option value="sports">Sports</option>
                    </select>
                  </div>

                  <div className="ea-field ea-grow">
                    <label>Search student</label>
                    <input
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      placeholder="Type a student name..."
                    />
                  </div>
                </div>

                <div className="ea-adminList">
                  {assignList.map((s) => (
                    <label key={s.id} className="ea-adminItem">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                      <div className="ea-adminItemText">
                        <div className="ea-adminItemName">{s.name}</div>
                        <div className="ea-muted">{(s.group || "prep").toUpperCase()}</div>
                      </div>
                    </label>
                  ))}
                  {assignList.length === 0 && <div className="ea-empty">No students found.</div>}
                </div>

                <div className="ea-rowEnd">
                  <div className="ea-muted">
                    Selected: <b>{selectedStudentIds.length}</b>
                  </div>

                  <button className="ea-btn ea-btnGhost" onClick={() => setSelectedStudentIds([])}>
                    Clear
                  </button>

                  <button className="ea-btn ea-btnPrimary" onClick={bulkAssign} disabled={!assignTeacherUid}>
                    Assign to Teacher
                  </button>

                  <button className="ea-btn ea-btnDark" onClick={bulkUnassign}>
                    Unassign
                  </button>
                </div>

                <div className="ea-muted">
                  Note: Teachers will only see students assigned to them for the currently selected block.
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}