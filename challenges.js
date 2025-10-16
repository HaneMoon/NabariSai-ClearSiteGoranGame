// MediaPipe ランドマークインデックス (変更無し)
const LANDMARK_INDICES = {
    // 上半身
    LEFT_SHOULDER: 11,
    LEFT_ELBOW: 13,
    LEFT_WRIST: 15,
    LEFT_HIP: 23, 
    RIGHT_SHOULDER: 12, 
    RIGHT_ELBOW: 14, 
    RIGHT_WRIST: 16, 
    RIGHT_HIP: 24, 
    // 下半身を追加
    LEFT_KNEE: 25, // 左膝
    LEFT_ANKLE: 27, // 左足首
    RIGHT_KNEE: 26, // 右膝
    RIGHT_ANKLE: 28, // 右足首
    // 剣のポーズ用に上半身のランドマークをさらに細かく定義 (例: 首や顔は含まないが、中心線上のランドマーク)
    NOSE: 0,
    LEFT_EYE: 2,
    RIGHT_EYE: 5,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
};

// **垂直ポーズで開始するチャレンジ（チュートリアル）**
export const VERTICAL_CHALLENGES = [
    {
        id: 'LIFT_LEFT',
        name: "左手を上げる (チュートリアル)",
        message: "【垂直スタート】両手を垂直に上げてポーズを維持してください。",
        targetType: 'ARM', 
        evalJoints: ['L_SHOULDER', 'L_ELBOW'],
        requiredStartPose: 'VERTICAL', 
        imageSrc: './images/kawaii_pose_overlay.png', 
    },
];

// **T字ポーズで開始するチャレンジ（ランダム対象）**
export const T_POSE_CHALLENGES = [
    {
        id: 'L_SHAPE_ARMS', // 両腕L字ポーズ
        name: "両腕L字ポーズ",
        message: "【T字スタート】両腕を水平に広げ、肘を直角に曲げたL字ポーズを維持してください。",
        targetType: 'L_SHAPE_ARMS', 
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'],
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/kawaii_pose_overlay.png', 
    },
    {
        id: 'LIFT_RIGHT', // 右手を上げる
        name: "右手を上げる",
        message: "【T字スタート】右手を垂直に上げてポーズを維持してください。",
        targetType: 'ARM',
        evalJoints: ['R_SHOULDER', 'R_ELBOW'],
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/kawaii_pose_overlay.png', 
    },
    // 片腕90度屈曲ポーズ (左)
    {
        id: 'L_SHAPE_LEFT',
        name: "片腕90度屈曲ポーズ (左)", 
        message: "【T字スタート】左上腕を下に45度、前腕を上に45度にし、右腕は力を抜いて下げてください。", 
        targetType: 'SINGLE_L_SHAPE', 
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/kawaii_pose_overlay.png', 
    },
    // 追加: 動的な突進・投擲ポーズ
    {
        id: 'DYNAMIC_DASH_POSE', 
        name: "突進・投擲ポーズ",
        message: "【T字スタート】体全体を前に傾け、片膝を深く曲げ、片腕を斜め上に振りかぶってください。",
        targetType: 'DYNAMIC_DASH', // 新しい評価タイプ
        evalJoints: ['L_SHOULDER', 'L_HIP', 'L_KNEE', 'R_KNEE'], // 評価する関節
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/dynamic_dash_overlay.png', // 画像パスを保持
    },
    // ★ 修正: 剣を構えるポーズ (片腕判定に変更)
    {
        id: 'SWORD_POSE',
        name: "剣を構えるポーズ (片手剣)",
        message: "【T字スタート】右腕で剣を構えるポーズを取り、左腕は自然に下げてください。",
        targetType: 'SINGLE_SWORD_POSE', // 新しいタイプに変更
        // 評価対象: 右肩、右肘、左肩（下ろし判定）
        evalJoints: ['R_SHOULDER', 'R_ELBOW', 'L_SHOULDER'], 
        requiredStartPose: 'T_POSE',
        imageSrc: './images/sword_pose_overlay.png', 
    },
];

// **全チャレンジのリスト** (変更無し)
export const ALL_CHALLENGES = [...VERTICAL_CHALLENGES, ...T_POSE_CHALLENGES];

// **実行するチャレンジ配列 (動的に追加される)** (変更無し)
export let CURRENT_CHALLENGES = [];

// その他の共通定数
export const TARGET_ANGLES = {
    ELBOW: 165, 
    SHOULDER: 165, 
    
    // L字ポーズの目標角度
    L_SHAPE_SHOULDER: 90, 
    L_SHAPE_ELBOW: 90, 
    
    // 90度屈曲ポーズの目標角度
    DEGREE_135: 135,
    DEGREE_90: 90,
    
    // 腕を下ろすポーズの目標角度（垂直）
    ARM_DOWN: 170, 
    
    // T字ポーズ
    T_POSE_SHOULDER: 90, 
    T_POSE_ELBOW: 170, 
    KNEE_STRAIGHT: 165, 
    
    // DYNAMIC_DASH の目標角度
    DASH_HIP: 140,       
    DASH_KNEE_FRONT: 100, 
    DASH_KNEE_BACK: 170,  
    DASH_THROW_SHOULDER: 150, 
    DASH_THROW_ELBOW: 160,    
    DASH_TILT: 20,           

    // ★ 修正: SINGLE_SWORD_POSE の目標角度 
    SWORD_SHOULDER: 100,     // 右肩を斜め前に構える角度（ヒップ-肩-肘）
    SWORD_ELBOW: 160,        // 右肘を少し曲げる角度
};

export const TOLERANCE = {
    ELBOW: 30,  
    SHOULDER: 40, 
    KNEE: 20, 
    TILT: 15, 
    
    // L字ポーズの許容誤差
    L_SHAPE_TOLERANCE: 30, 
    // 腕を下ろすポーズの許容誤差 (流用)
    ARM_DOWN_TOLERANCE: 20,
    
    // スタートポーズの許容誤差
    START_TOLERANCE_VERTICAL: 30, 
    // T字ポーズの許容誤差
    START_TOLERANCE_T_POSE: 30, 
    
    // DYNAMIC_DASH の許容誤差
    DASH_TOLERANCE: 30, 

    // ★ 修正: SINGLE_SWORD_POSE の許容誤差
    SWORD_TOLERANCE: 40, // 厳しすぎないよう調整
};

export const LANDMARKS = LANDMARK_INDICES;