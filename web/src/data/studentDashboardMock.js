// Mock data for Student Dashboard. Replace with API calls when backend is ready.

export const BOARDS = ['CBSE', 'ICSE', 'Tamil Nadu State Board', 'State Board']

export const SUBJECTS_BY_GRADE = {
  8: [
    { id: 'eng', name: 'English', icon: '📘' },
    { id: 'sci', name: 'Science', icon: '🔬' },
    { id: 'math', name: 'Math', icon: '➗' },
    { id: 'sst', name: 'Social Studies', icon: '🌍' },
  ],
  9: [
    { id: 'eng', name: 'English', icon: '📘' },
    { id: 'sci', name: 'Science', icon: '🔬' },
    { id: 'math', name: 'Math', icon: '➗' },
    { id: 'sst', name: 'Social Studies', icon: '🌍' },
  ],
  10: [
    { id: 'eng', name: 'English', icon: '📘' },
    { id: 'sci', name: 'Science', icon: '🔬' },
    { id: 'math', name: 'Math', icon: '➗' },
    { id: 'sst', name: 'Social Studies', icon: '🌍' },
  ],
}

export const LESSONS_BY_SUBJECT = {
  sci: [
    { id: 'mag', title: 'Magnetism' },
    { id: 'heat', title: 'Heat' },
    { id: 'acid', title: 'Acids & Bases' },
    { id: 'org', title: 'Organisation of Life' },
  ],
  math: [
    { id: 'alg', title: 'Linear Equations' },
    { id: 'geom', title: 'Quadrilaterals' },
    { id: 'stats', title: 'Statistics' },
  ],
  eng: [
    { id: 'gram', title: 'Tenses' },
    { id: 'comp', title: 'Comprehension' },
  ],
  sst: [
    { id: 'hist', title: 'Indian National Movement' },
    { id: 'res', title: 'Resources' },
  ],
}

export const SUGGESTED_QUESTIONS = {
  mag: [
    'Why do magnets attract iron?',
    'What are magnetic poles?',
    'What is a magnetic field?',
    'Why does a compass work?',
  ],
  heat: [
    'What is heat?',
    'What is temperature?',
    'How does conduction work?',
  ],
  acid: [
    'What are acids and bases?',
    'What is pH?',
    'What is neutralisation?',
  ],
  org: [
    'What is a cell?',
    'What is the organisation of life?',
  ],
  alg: ['What is a linear equation?', 'How do we solve linear equations?'],
  geom: ['What is a quadrilateral?', 'What are the types of quadrilaterals?'],
  stats: ['What is mean?', 'What is median and mode?'],
  gram: ['What are tenses?', 'What is present perfect?'],
  comp: ['How do I answer comprehension?'],
  hist: ['What was the Indian National Movement?'],
  res: ['What are natural resources?'],
}

export const LESSON_TOPICS = {
  mag: [
    'What is a magnet',
    'Magnetic poles',
    'Magnetic field',
    'Electromagnets',
    'Applications',
  ],
  heat: ['What is heat', 'Temperature', 'Conduction', 'Convection', 'Radiation'],
  acid: ['Acids and bases', 'pH scale', 'Neutralisation', 'Indicators'],
  org: ['Cell structure', 'Tissues', 'Organs', 'Organ systems'],
  alg: ['Introduction', 'Solving equations', 'Word problems'],
  geom: ['Definition', 'Types', 'Properties'],
  stats: ['Mean', 'Median', 'Mode'],
  gram: ['Present', 'Past', 'Future'],
  comp: ['Reading', 'Inference', 'Vocabulary'],
  hist: ['Timeline', 'Key events', 'Leaders'],
  res: ['Types', 'Conservation'],
}

export const TEACHERS = [
  {
    id: 't1',
    name: 'Dr Ravi Kumar',
    school: 'Delhi Public School',
    style: 'Socratic',
    rating: 4.7,
    avatar: null,
  },
  {
    id: 't2',
    name: 'Ms Priya Sharma',
    school: 'KV No. 2',
    style: 'Storytelling',
    rating: 4.9,
    avatar: null,
  },
  {
    id: 't3',
    name: 'Prof Anand Mehta',
    school: 'Birla Vidya Mandir',
    style: 'Concept-first',
    rating: 4.5,
    avatar: null,
  },
  {
    id: 't4',
    name: 'Mrs Lakshmi Nair',
    school: 'Kendriya Vidyalaya',
    style: 'Exam-oriented',
    rating: 4.8,
    avatar: null,
  },
  {
    id: 't5',
    name: 'Mr Suresh Patel',
    school: 'DAV School',
    style: 'Visual explanation',
    rating: 4.6,
    avatar: null,
  },
]

export const RESPONSE_MODES = [
  { id: 'text', label: 'Text' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
]

export const DIFFICULTY_LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'exam', label: 'Exam Preparation' },
  { id: 'deep', label: 'Deep Understanding' },
]
