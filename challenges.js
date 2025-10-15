// MediaPipe ランドマークインデックス
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
};

// **全チャレンジのリスト**
export const ALL_CHALLENGES = [
    {
        id: 'L_SHAPE_ARMS', // L字ポーズ
        name: "両腕L字ポーズ",
        message: "【チャレンジ0】両腕を水平に広げ、肘を直角に曲げたL字ポーズを維持してください。",
        targetType: 'L_SHAPE_ARMS', 
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
    },
    {
        id: 'LIFT_LEFT',
        name: "左手を上げる",
        message: "【チャレンジ1】左手を垂直に上げてポーズを維持してください。",
        targetType: 'ARM', 
        evalJoints: ['L_SHOULDER', 'L_ELBOW'], 
    },
    {
        id: 'LIFT_RIGHT',
        name: "右手を上げる",
        message: "【チャレンジ2】今度は右手を垂直に上げてポーズを維持してください。",
        targetType: 'ARM',
        evalJoints: ['R_SHOULDER', 'R_ELBOW'],
    },
    // 下半身のチャレンジ（LEG_BALANCE, SQUAT, WARRIOR_II）を削除
];

// **実行するチャレンジ配列 (script.jsで初期化される)**
export let CURRENT_CHALLENGES = [];

// その他の共通定数
export const TARGET_ANGLES = {
    ELBOW: 165, 
    SHOULDER: 165, 
    // L字ポーズの目標角度
    L_SHAPE_SHOULDER: 90, 
    L_SHAPE_ELBOW: 90, 
    
    // T字ポーズ
    T_POSE_SHOULDER: 90, 
    T_POSE_ELBOW: 170, 
    KNEE_STRAIGHT: 165, 
};

export const TOLERANCE = {
    ELBOW: 30,  
    SHOULDER: 40, 
    KNEE: 20, 
    TILT: 15, 
    
    // L字ポーズの許容誤差
    L_SHAPE_TOLERANCE: 30, 
    
    // スタートポーズの許容誤差
    START_TOLERANCE_VERTICAL: 30, 
    START_TOLERANCE_T_POSE: 20, 
};

export const LANDMARKS = LANDMARK_INDICES;