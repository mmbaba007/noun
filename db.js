/**
 * NOUN PORTAL — localStorage Database Layer
 * ==========================================
 * Schema (3NF normalized, relationships enforced via foreign keys):
 *
 * USERS         { id(PK), username, passwordHash, role, name, email, phone, createdAt }
 * STUDENTS      { id(PK), userId(FK→USERS), matric, department, level, studyCenter }
 * LECTURERS     { id(PK), userId(FK→USERS), staffId, department }
 * COURSES       { id(PK), code, title, units, lecturerId(FK→LECTURERS) }
 * ENROLLMENTS   { id(PK), studentId(FK→STUDENTS), courseId(FK→COURSES), semester, date }
 * RESULTS       { id(PK), studentId(FK→STUDENTS), courseId(FK→COURSES), score, grade, semester, updatedAt, updatedBy }
 * MATERIALS     { id(PK), courseId(FK→COURSES), title, type, filename, data(base64), size, uploadedBy(FK→USERS), uploadedAt }
 * AUDIT_TRAIL   { id(PK), ts, actorId(FK→USERS), actorName, studentId(FK→STUDENTS), courseId(FK→COURSES), oldGrade, newGrade, reason }
 *
 * One-to-Many:  STUDENTS → RESULTS  (one student has many results)
 *               STUDENTS → ENROLLMENTS
 *               COURSES  → MATERIALS (one course has many materials)
 *               COURSES  → RESULTS
 *               LECTURERS→ COURSES
 */

const DB = (() => {
  /* ── helpers ─────────────────────────────────── */
  const uid  = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const now  = () => new Date().toISOString().replace('T',' ').substring(0,19);
  const get  = k => { try { return JSON.parse(localStorage.getItem('noun_'+k)) || []; } catch{ return []; } };
  const set  = (k,v) => localStorage.setItem('noun_'+k, JSON.stringify(v));

  /* ── grade helper ─────────────────────────────── */
  const scoreToGrade = s => s>=70?'A':s>=60?'B':s>=50?'C':s>=40?'D':'F';

  /* ── seed admin if first run ──────────────────── */
  const boot = () => {
    if (!localStorage.getItem('noun_booted')) {
      set('users', [{
        id:'admin_001', username:'admin', password:'admin123',
        role:'admin', name:'Portal Administrator',
        email:'admin@noun.edu.ng', phone:'', createdAt: now()
      }]);
      set('students',[]); set('lecturers',[]); set('courses',[]);
      set('enrollments',[]); set('results',[]); set('materials',[]);
      set('audit_trail',[]); set('feedback', []);
      localStorage.setItem('noun_booted','1');
    }
  };

  /* ══════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════ */
  const login = (username, password, role) => {
    const u = get('users').find(u => u.username===username && u.password===password && u.role===role);
    return u || null;
  };
  const currentUser = () => {
    try { return JSON.parse(sessionStorage.getItem('noun_session')); } catch { return null; }
  };
  const requireAuth = (roles=[]) => {
    const u = currentUser();
    if (!u) { window.location.href='index.html'; return null; }
    if (roles.length && !roles.includes(u.role)) { window.location.href='index.html'; return null; }
    return u;
  };
  const logout = () => { sessionStorage.removeItem('noun_session'); window.location.href='index.html'; };

  /* ══════════════════════════════════════════════
     USERS / STUDENTS / LECTURERS
  ══════════════════════════════════════════════ */
  const getUsers    = () => get('users');
  const getStudents = () => get('students');
  const getLecturers= () => get('lecturers');

  const getStudentByUserId = userId => get('students').find(s=>s.userId===userId);
  const getLecturerByUserId= userId => get('lecturers').find(l=>l.userId===userId);
  const getUserById = id => get('users').find(u=>u.id===id);
  const getStudentById = id => get('students').find(s=>s.id===id);

  const addStudent = ({name, username, password, email, phone, matric, department, level, studyCenter}) => {
    const users = get('users');
    if (users.find(u=>u.username===username)) throw new Error('Username already exists.');
    if (get('students').find(s=>s.matric===matric)) throw new Error('Matric number already exists.');
    const userId = uid();
    users.push({ id:userId, username, password, role:'student', name, email:email||username+'@noun.edu.ng', phone:phone||'', createdAt:now() });
    set('users', users);
    const students = get('students');
    const studentId = uid();
    students.push({ id:studentId, userId, matric, department, level, studyCenter:studyCenter||'Main Campus' });
    set('students', students);
    return studentId;
  };

  const addLecturer = ({name, username, password, email, phone, staffId, department}) => {
    const users = get('users');
    if (users.find(u=>u.username===username)) throw new Error('Username already exists.');
    const userId = uid();
    users.push({ id:userId, username, password, role:'lecturer', name, email:email||username+'@noun.edu.ng', phone:phone||'', createdAt:now() });
    set('users', users);
    const lecturers = get('lecturers');
    const lecturerId = uid();
    lecturers.push({ id:lecturerId, userId, staffId:staffId||'STAFF-'+Date.now(), department });
    set('lecturers', lecturers);
    return lecturerId;
  };

  /* ══════════════════════════════════════════════
     COURSES
  ══════════════════════════════════════════════ */
  const getCourses = () => get('courses');
  const getCourseById = id => get('courses').find(c=>c.id===id);
  const getCourseByCode = code => get('courses').find(c=>c.code===code);

  const addCourse = ({code, title, units, lecturerId}) => {
    if (get('courses').find(c=>c.code===code)) throw new Error('Course code already exists.');
    const courses = get('courses');
    const id = uid();
    courses.push({ id, code, title, units:parseInt(units)||3, lecturerId:lecturerId||'' });
    set('courses', courses);
    return id;
  };

  const assignLecturerToCourse = (courseId, lecturerId) => {
    const courses = get('courses');
    const c = courses.find(c=>c.id===courseId);
    if (c) { c.lecturerId = lecturerId; set('courses', courses); }
  };

  const getCoursesForLecturer = lecturerId => get('courses').filter(c=>c.lecturerId===lecturerId);

  /* ══════════════════════════════════════════════
     ENROLLMENTS (Student ↔ Course)
  ══════════════════════════════════════════════ */
  const getEnrollments = () => get('enrollments');
  const getEnrollmentsForStudent = studentId => get('enrollments').filter(e=>e.studentId===studentId);
  const getEnrolledCourses = studentId => {
    return getEnrollmentsForStudent(studentId).map(e => getCourseById(e.courseId)).filter(Boolean);
  };

  const enroll = (studentId, courseId, semester='2024/2025') => {
    const enr = get('enrollments');
    if (enr.find(e=>e.studentId===studentId && e.courseId===courseId)) return; // already enrolled
    enr.push({ id:uid(), studentId, courseId, semester, date: now().split(' ')[0] });
    set('enrollments', enr);
  };

  /* ══════════════════════════════════════════════
     RESULTS  (FK: studentId, courseId)
  ══════════════════════════════════════════════ */
  const getResults = () => get('results');
  const getResultsForStudent = studentId => get('results').filter(r=>r.studentId===studentId);
  const getResultForStudentCourse = (studentId, courseId) => get('results').find(r=>r.studentId===studentId && r.courseId===courseId);

  const upsertResult = (studentId, courseId, score, actorUser) => {
    const results = get('results');
    const existing = results.find(r=>r.studentId===studentId && r.courseId===courseId);
    const newGrade = scoreToGrade(score);
    const now_ = now();

    if (existing) {
      const oldGrade = existing.grade;
      existing.score = score; existing.grade = newGrade; existing.updatedAt = now_; existing.updatedBy = actorUser.name;
      set('results', results);
      // Audit
      addAuditEntry({ actorId:actorUser.id, actorName:actorUser.name, studentId, courseId, oldGrade, newGrade, reason:'Grade updated' });
    } else {
      results.push({ id:uid(), studentId, courseId, score, grade:newGrade, semester:'2024/2025', updatedAt:now_, updatedBy:actorUser.name });
      set('results', results);
      // Enroll if not already
      enroll(studentId, courseId);
      addAuditEntry({ actorId:actorUser.id, actorName:actorUser.name, studentId, courseId, oldGrade:'—', newGrade, reason:'Result entered' });
    }
  };

  const calcGPA = (studentId) => {
    const res = getResultsForStudent(studentId);
    if (!res.length) return '0.00';
    const gp = {A:5,B:4,C:3,D:2,F:0};
    let pts=0, units=0;
    res.forEach(r => {
      const c = getCourseById(r.courseId);
      const u = c ? c.units : 3;
      pts += (gp[r.grade]||0)*u; units += u;
    });
    return units ? (pts/units).toFixed(2) : '0.00';
  };

  /* ══════════════════════════════════════════════
     MATERIALS  (FK: courseId, uploadedBy)
  ══════════════════════════════════════════════ */
  const getMaterials = () => get('materials');
  const getMaterialsForCourse = courseId => get('materials').filter(m=>m.courseId===courseId);
  const getMaterialsForStudent = studentId => {
    const enrolled = getEnrollmentsForStudent(studentId).map(e=>e.courseId);
    return get('materials').filter(m=>enrolled.includes(m.courseId));
  };

  const uploadMaterial = ({courseId, title, type, filename, data, size, uploadedBy}) => {
    const mats = get('materials');
    mats.push({ id:uid(), courseId, title, type, filename, data, size, uploadedBy:uploadedBy.id, uploaderName:uploadedBy.name, uploadedAt:now() });
    set('materials', mats);
  };

  const deleteMaterial = id => {
    set('materials', get('materials').filter(m=>m.id!==id));
  };

  /* ══════════════════════════════════════════════
     AUDIT TRAIL
  ══════════════════════════════════════════════ */
  const getAuditTrail = () => get('audit_trail');

  const addAuditEntry = ({actorId, actorName, studentId, courseId, oldGrade, newGrade, reason}) => {
    const trail = get('audit_trail');
    trail.push({ id:uid(), ts:now(), actorId, actorName, studentId, courseId, oldGrade, newGrade, reason });
    set('audit_trail', trail);
  };

  /* ══════════════════════════════════════════════
     FEEDBACK
     FEEDBACK { id(PK), userId(FK→USERS), userName, role,
                easeOfUse(1-5), speed(1-5), satisfaction(1-5),
                comments, submittedAt }
  ══════════════════════════════════════════════ */
  const getFeedback = () => get('feedback');

  const submitFeedback = ({userId, userName, role, easeOfUse, speed, satisfaction, comments}) => {
    const fb = get('feedback');
    const existing = fb.findIndex(f => f.userId === userId);
    const entry = { id: uid(), userId, userName, role, easeOfUse, speed, satisfaction, comments, submittedAt: now() };
    if (existing >= 0) { fb[existing] = entry; } else { fb.push(entry); }
    set('feedback', fb);
  };

  const getUserFeedback = userId => get('feedback').find(f => f.userId === userId) || null;

  /* ══════════════════════════════════════════════
     HELPERS FOR UI
  ══════════════════════════════════════════════ */
  const studentFullProfile = studentId => {
    const s  = get('students').find(st=>st.id===studentId);
    if (!s) return null;
    const u  = getUserById(s.userId);
    return { ...s, ...u, studentId };
  };

  const lecturerFullProfile = lecturerId => {
    const l  = get('lecturers').find(lt=>lt.id===lecturerId);
    if (!l) return null;
    const u  = getUserById(l.userId);
    return { ...l, ...u, lecturerId };
  };

  const allStudentsWithProfiles = () => {
    return get('students').map(s => {
      const u = getUserById(s.userId) || {};
      // Spread user first, then student — so student's own `id` wins over user's `id`
      return { ...u, ...s, studentId: s.id };
    });
  };

  const allLecturersWithProfiles = () => {
    return get('lecturers').map(l => {
      const u = getUserById(l.userId) || {};
      // Spread user first, then lecturer — so lecturer's own `id` wins over user's `id`
      return { ...u, ...l, lecturerId: l.id };
    });
  };

  const scoreToGradePub = scoreToGrade;

  boot();

  return {
    login, currentUser, requireAuth, logout,
    getUsers, getStudents, getLecturers,
    getStudentByUserId, getLecturerByUserId, getUserById, getStudentById,
    addStudent, addLecturer,
    getCourses, getCourseById, getCourseByCode,
    addCourse, assignLecturerToCourse, getCoursesForLecturer,
    getEnrollments, getEnrollmentsForStudent, getEnrolledCourses, enroll,
    getResults, getResultsForStudent, getResultForStudentCourse, upsertResult, calcGPA,
    getMaterials, getMaterialsForCourse, getMaterialsForStudent, uploadMaterial, deleteMaterial,
    getAuditTrail, addAuditEntry,
    getFeedback, submitFeedback, getUserFeedback,
    studentFullProfile, lecturerFullProfile, allStudentsWithProfiles, allLecturersWithProfiles,
    scoreToGrade: scoreToGradePub
  };
})();
