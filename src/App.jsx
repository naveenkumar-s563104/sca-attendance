import React, { useEffect, useMemo, useState } from "react";
import EduattendDashboard from "./EduattendDashboard";
import { initializeApp } from "firebase/app";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { ShieldCheck } from "lucide-react";
import "./eduattend.css";

/* ==========================================================
   🛠️ VITE / NETLIFY CONFIGURATION
   ========================================================== */
const getEnv = (key) => {
  try {
    return import.meta.env[key] || "";
  } catch {
    return "";
  }
};

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID"),
};

if (!firebaseConfig.apiKey && typeof __firebase_config !== "undefined") {
  Object.assign(firebaseConfig, JSON.parse(__firebase_config));
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const APP_ID =
  getEnv("VITE_APP_ID") ||
  (typeof __app_id !== "undefined" ? __app_id : "sca-attendance-pro");

const SCHOOL_NAME = "Springfield Commonwealth Academy";
const CREATOR_NAME = "Naveen Kumar Kottidi";

// ✅ Block 1–7
const BLOCKS = ["Block 1", "Block 2", "Block 3", "Block 4", "Block 5", "Block 6", "Block 7"];

const getPath = (col) => ["artifacts", APP_ID, "public", "data", col];

function makeCode(prefix = "TCH") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${out}`;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth form
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    displayName: "",
    inviteCode: "",
  });
  const [authErr, setAuthErr] = useState("");

  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBlock, setSelectedBlock] = useState("Block 1");

  // Data
  const [allStudents, setAllStudents] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [teachers, setTeachers] = useState([]); // admin only

  // UI
  const [searchTerm, setSearchTerm] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkGroup, setBulkGroup] = useState("prep"); // prep|sports
  const [errorModal, setErrorModal] = useState(null);
  const [toast, setToast] = useState("");

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  /* =========================
     AUTH STATE (NO ANONYMOUS)
     - Require users/{uid} profile doc
  ========================= */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthErr("");
      setLoading(false);

      if (!u) {
        setUser(null);
        setProfile(null);
        return;
      }

      setUser(u);

      try {
        const userRef = doc(db, ...getPath("users"), u.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          setProfile(null);
          setAuthErr("No profile found. Contact admin for access.");
          await signOut(auth);
          setUser(null);
          return;
        }

        const data = snap.data() || {};
        setProfile({
          uid: u.uid,
          email: u.email,
          displayName: data.displayName || u.displayName || u.email,
          role: data.role === "admin" ? "admin" : "teacher",
          subjects: Array.isArray(data.subjects) ? data.subjects : [],
        });
      } catch (err) {
        console.error("Profile load failed:", err);
        setProfile(null);
        setAuthErr("Profile load failed. Try again.");
      }
    });

    return () => unsub();
  }, []);

  /* =========================
     LOGIN / SIGNUP
     - Signup requires invite code (teacher only)
     - Invite stores teacherName + subjects
  ========================= */
  async function handleAuth(e) {
    e.preventDefault();
    setAuthErr("");

    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        return;
      }

      const code = authForm.inviteCode.trim().toUpperCase();
      if (!code) throw new Error("Invite code required");

      const invRef = doc(db, ...getPath("invites"), code);
      const invSnap = await getDoc(invRef);

      if (!invSnap.exists() || invSnap.data().used) {
        throw new Error("Invalid or used invite code");
      }

      const inv = invSnap.data() || {};
      const teacherName =
        (inv.teacherName || "").trim() ||
        (authForm.displayName || "").trim() ||
        authForm.email;

      const subjects =
        Array.isArray(inv.subjects) && inv.subjects.length
          ? inv.subjects
          : (inv.subjectText || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

      const cred = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);

      const newProfile = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: teacherName,
        role: "teacher",
        subjects,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, ...getPath("users"), cred.user.uid), newProfile);

      await setDoc(
        invRef,
        { used: true, usedBy: cred.user.uid, usedEmail: cred.user.email, usedAt: serverTimestamp() },
        { merge: true }
      );

      setProfile(newProfile);
    } catch (err) {
      setAuthErr(String(err?.message || "Auth error").replace("Firebase: ", ""));
    }
  }

  /* =========================
     REALTIME DATA
     - Students:
         admin -> all students
         teacher -> only students assigned to them for the CURRENT selected block
     - Attendance: all docs (filtered by date in memory)
     - Teachers list: admin only (role==teacher)
  ========================= */
  useEffect(() => {
    if (!user || !profile) return;

    const studentsCol = collection(db, ...getPath("students"));

    // IMPORTANT: for teacher, filter by assignments.<Block N> == uid
    const studentsQ =
      profile.role === "admin"
        ? studentsCol
        : query(studentsCol, where(`assignments.${selectedBlock}`, "==", user.uid));

    const unsubStudents = onSnapshot(
      studentsQ,
      (snap) => setAllStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => flash("Roster Sync Error: " + err.message)
    );

    const unsubAttendance = onSnapshot(
      collection(db, ...getPath("attendance")),
      (snap) => setAllAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => flash("Attendance Sync Error: " + err.message)
    );

    let unsubTeachers = () => {};
    if (profile.role === "admin") {
      unsubTeachers = onSnapshot(
        collection(db, ...getPath("users")),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ uid: d.id, ...d.data() }))
            .filter((u) => (u.role || "") === "teacher")
            .map((u) => ({
              uid: u.uid,
              displayName: u.displayName || u.email || u.uid,
              email: u.email || "",
              subjects: Array.isArray(u.subjects) ? u.subjects : [],
            }))
            .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
          setTeachers(list);
        },
        (err) => flash("Teachers Sync Error: " + err.message)
      );
    } else {
      setTeachers([]);
    }

    return () => {
      unsubStudents();
      unsubAttendance();
      unsubTeachers();
    };
  }, [user, profile, selectedBlock]);

  const students = useMemo(() => {
    return [...allStudents].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allStudents]);

  const attendance = useMemo(() => {
    return allAttendance.filter((a) => a.date === selectedDate);
  }, [allAttendance, selectedDate]);

  const presentCount = useMemo(() => {
    return attendance.filter((a) => a.block === selectedBlock && a.status === "present").length;
  }, [attendance, selectedBlock]);

  const absentCount = useMemo(() => {
    return attendance.filter((a) => a.block === selectedBlock && a.status === "absent").length;
  }, [attendance, selectedBlock]);

  /* =========================
     ATTENDANCE WRITE
     - one doc per (date + block + student)
     - teacherUid always written (including unmarked)
     - rules will prevent teachers from writing if not assigned for that block
     - rules will prevent other teachers from editing once created (owner lock)
  ========================= */
  async function markAttendance(student, status, blockOverride) {
    if (!user || !profile) return;

    const block = blockOverride || selectedBlock;
    const docId = `${selectedDate}__${block.replace(/\s/g, "")}__${student.id}`;

    const payload = {
      studentId: student.id,
      studentName: student.name,
      date: selectedDate,
      block,
      status,
      teacherName: profile.displayName || profile.email,
      teacherUid: user.uid,
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, ...getPath("attendance"), docId), payload);
      flash(`${student.name} → ${block}: ${status}`);
    } catch (err) {
      setErrorModal(
        err?.message?.toLowerCase?.().includes("permission")
          ? "Not allowed. (Either you’re not assigned for this block, or another teacher already created the record.) Admin can override."
          : `Failed to save: ${err?.message || "Unknown error"}`
      );
    }
  }

  /* =========================
     STUDENT IMPORT
     - creates students with:
         group: prep|sports
         assignments: {}
  ========================= */
  async function handleBulkImport() {
    if (!user || !profile) return;

    const names = bulkText
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);

    if (!names.length) return;

    try {
      const batch = writeBatch(db);
      names.forEach((name) => {
        const ref = doc(collection(db, ...getPath("students")));
        batch.set(ref, {
          name,
          nameLower: name.toLowerCase(),
          group: bulkGroup === "sports" ? "sports" : "prep",
          assignments: {}, // Block assignments map
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setBulkText("");
      setIsImporting(false);
      flash(`Imported ${names.length} students`);
    } catch (e) {
      flash("Import failed: " + (e?.message || "unknown error"));
    }
  }

  function exportCSV() {
    let csv = "Student," + BLOCKS.join(",") + "\n";
    // NOTE: admin exports their current roster view; teacher exports their block roster (by design)
    students.forEach((st) => {
      const row = [st.name];
      BLOCKS.forEach((b) => {
        const rec = attendance.find((a) => a.studentId === st.id && a.block === b);
        row.push(rec?.status || "unmarked");
      });
      csv += row.join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SCA_Attendance_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* =========================
     VIEW ONLY MATRIX ROWS
     - includes ALL blocks
     - for teacher: shows only students assigned for selectedBlock (because students query is block-filtered)
     - for admin: shows all students
  ========================= */
  const tableRows = useMemo(() => {
    const idx = new Map();
    for (const a of attendance) idx.set(`${a.studentId}__${a.block}`, a.status);

    const filtered = searchTerm
      ? students.filter((s) => (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
      : students;

    return filtered.map((s) => {
      const blocks = {};
      for (const b of BLOCKS) {
        const status = idx.get(`${s.id}__${b}`);
        blocks[b] = status === "present" ? "P" : status === "absent" ? "A" : "—";
      }
      return { id: s.id, name: s.name, group: s.group || "prep", blocks };
    });
  }, [attendance, students, searchTerm]);

  /* =========================
     ADMIN: INVITES
  ========================= */
  async function adminCreateInvite({ teacherName, subjectsText }) {
    if (!profile || profile.role !== "admin") return;

    const code = makeCode("TCH");
    const subjects = (subjectsText || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    await setDoc(doc(db, ...getPath("invites"), code), {
      used: false,
      teacherName: (teacherName || "").trim(),
      subjects,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });

    flash(`Invite created: ${code}`);
    return code;
  }

  /* =========================
     ADMIN: BULK ASSIGN STUDENTS TO TEACHER FOR A BLOCK
     - assignments["Block N"] = teacherUid
  ========================= */
  async function adminBulkAssign({ block, teacherUid, studentIds = [] }) {
    if (!profile || profile.role !== "admin") return;
    if (!block || !teacherUid || !studentIds.length) return;

    const teacher = teachers.find((t) => t.uid === teacherUid);

    const batch = writeBatch(db);
    for (const sid of studentIds) {
      const ref = doc(db, ...getPath("students"), sid);

      // set assignments.<block> = teacherUid
      batch.update(ref, {
        [`assignments.${block}`]: teacherUid,
        [`assignmentNames.${block}`]: teacher?.displayName || "",
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    flash(`Assigned ${studentIds.length} student(s) to ${block}`);
  }

  async function adminBulkUnassign({ block, studentIds = [] }) {
    if (!profile || profile.role !== "admin") return;
    if (!block || !studentIds.length) return;

    // To remove a map key in Firestore, use update with FieldValue.delete()
    // We'll do it via updateDoc per doc to keep it simple (batch supports it too).
    // Import FieldValue? We'll avoid by setting to null then rules can ignore null.
    // Better: set to "" (empty) and treat as unassigned.
    const batch = writeBatch(db);
    for (const sid of studentIds) {
      const ref = doc(db, ...getPath("students"), sid);
      batch.update(ref, {
        [`assignments.${block}`]: "",
        [`assignmentNames.${block}`]: "",
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    flash(`Unassigned ${studentIds.length} student(s) from ${block}`);
  }

  async function handleLogout() {
    setUser(null);
    setProfile(null);
    try {
      await signOut(auth);
    } catch {}
  }

  /* =========================
     LOADING
  ========================= */
  if (loading) {
    return (
      <div className="ea-authPage">
        <div className="ea-card" style={{ padding: 16, width: "min(520px, 100%)" }}>
          <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldCheck size={18} /> Loading…
          </div>
          <div className="ea-muted" style={{ marginTop: 6 }}>
            Checking session and profile…
          </div>
        </div>
      </div>
    );
  }

  /* =========================
     LOGIN
  ========================= */
  if (!profile) {
    return (
      <div className="ea-authPage">
        <div className="ea-authWrap">
          <div className="ea-authCard ea-authCardWide">
            <div className="ea-authHeaderRow">
              <div className="ea-authHeaderLeft">
                <div className="ea-authLogoBox">
                  <img
                    src="/scaLogo.png"
                    alt="School logo"
                    className="ea-authLogo"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <ShieldCheck size={22} className="ea-authLogoFallback" />
                </div>

                <div>
                  <div className="ea-authSchool">{SCHOOL_NAME}</div>
                  <div className="ea-authSub">Attendance Console</div>
                </div>
              </div>

              <button
                type="button"
                className="ea-btn ea-btnGhost"
                onClick={() => {
                  setAuthErr("");
                  setAuthMode(authMode === "login" ? "signup" : "login");
                }}
              >
                {authMode === "login" ? "Create teacher account" : "Back to sign in"}
              </button>
            </div>

            <div className="ea-authDivider" />

            <form className="ea-authForm" onSubmit={handleAuth}>
              {authMode === "signup" && (
                <div className="ea-authGrid2">
                  <div className="ea-authField">
                    <label>Teacher name</label>
                    <input
                      required
                      value={authForm.displayName}
                      onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })}
                      placeholder="Teacher Name"
                    />
                  </div>

                  <div className="ea-authField">
                    <label>Invite code</label>
                    <input
                      required
                      value={authForm.inviteCode}
                      onChange={(e) => setAuthForm({ ...authForm, inviteCode: e.target.value })}
                      placeholder="TCH-XXXXXXX"
                    />
                  </div>
                </div>
              )}

              <div className="ea-authField">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  placeholder="name@sca.edu"
                />
              </div>

              <div className="ea-authField">
                <label>Password</label>
                <input
                  type="password"
                  required
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>

              {authErr && <div className="ea-authError">{authErr}</div>}

              <button className="ea-authSubmit" type="submit">
                {authMode === "login" ? "Sign in" : "Create account"}
              </button>

              <div className="ea-authFooter">
                Teachers sign up using an invite code created by the Admin.
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* =========================
     MAIN APP
  ========================= */
  return (
    <>
      <EduattendDashboard
        schoolName={SCHOOL_NAME}
        userRole={profile?.role}
        userUid={user?.uid}
        userDisplayName={profile?.displayName}
        userSubjects={profile?.subjects || []}
        blocks={BLOCKS}
        teachers={teachers}
        studentsCount={students.length}
        presentCount={presentCount}
        absentCount={absentCount}
        studentSearch={searchTerm}
        setStudentSearch={setSearchTerm}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedBlock={selectedBlock}
        setSelectedBlock={setSelectedBlock}
        onExportCSV={exportCSV}
        onOpenImport={() => setIsImporting(true)}
        onLogout={handleLogout}
        tableRows={tableRows}
        studentsRaw={students}
        attendanceRaw={attendance}
        onMark={(studentId, block, next) => {
          const student = students.find((s) => s.id === studentId);
          if (!student) return;
          if (next === "P") return markAttendance(student, "present", block);
          if (next === "A") return markAttendance(student, "absent", block);
          return markAttendance(student, "unmarked", block);
        }}
        // admin tools
        onAdminCreateInvite={adminCreateInvite}
        onAdminBulkAssign={adminBulkAssign}
        onAdminBulkUnassign={adminBulkUnassign}
      />

      {/* Import Modal */}
      {isImporting && (
        <div className="ea-modalBackdrop">
          <div className="ea-modal">
            <div className="ea-modalHead">
              <div className="ea-modalTitle">Student Import</div>
              <button className="ea-btn ea-btnGhost" onClick={() => setIsImporting(false)}>
                Close
              </button>
            </div>

            <div className="ea-modalBody">
              <div className="ea-adminRow">
                <div className="ea-field ea-grow">
                  <label>Group</label>
                  <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)}>
                    <option value="prep">Prep</option>
                    <option value="sports">Sports</option>
                  </select>
                </div>
              </div>

              <div className="ea-muted">Paste names (one per line or comma-separated).</div>

              <textarea
                className="ea-textarea"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"Jane Doe\nJohn Smith\n…"}
              />

              <div className="ea-rowEnd">
                <button className="ea-btn ea-btnGhost" onClick={() => setIsImporting(false)}>
                  Cancel
                </button>

                <button className="ea-btn ea-btnPrimary" onClick={handleBulkImport}>
                  Import
                </button>
              </div>

              <div className="ea-muted" style={{ marginTop: 10 }}>
                {SCHOOL_NAME} • Digital Infrastructure: {CREATOR_NAME}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal && (
        <div className="ea-modalBackdrop">
          <div className="ea-modal" style={{ maxWidth: 540 }}>
            <div className="ea-modalHead">
              <div className="ea-modalTitle">Notice</div>
              <button className="ea-btn ea-btnGhost" onClick={() => setErrorModal(null)}>
                Close
              </button>
            </div>
            <div className="ea-modalBody" style={{ fontWeight: 800 }}>
              {errorModal}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="ea-toast">{toast}</div>}
    </>
  );
}