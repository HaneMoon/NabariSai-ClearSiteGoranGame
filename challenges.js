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

// **エクスポートするチャレンジ配列**
export const CHALLENGES = [
    {
        name: "左手を上げる",
        message: "【チャレンジ1/3】左手を垂直に上げてポーズを維持してください。",
        targetType: 'ARM', // 評価タイプ: 腕
        evalJoints: ['L_SHOULDER', 'L_ELBOW'], 
        score: null,
        shoulder: LANDMARK_INDICES.LEFT_SHOULDER, // 互換性維持のため再定義
        elbow: LANDMARK_INDICES.LEFT_ELBOW,
        wrist: LANDMARK_INDICES.LEFT_WRIST,
        hip: LANDMARK_INDICES.LEFT_HIP,
    },
    {
        name: "右手を上げる",
        message: "【チャレンジ2/3】今度は右手を垂直に上げてポーズを維持してください。",
        targetType: 'ARM',
        evalJoints: ['R_SHOULDER', 'R_ELBOW'],
        score: null,
        shoulder: LANDMARK_INDICES.RIGHT_SHOULDER,
        elbow: LANDMARK_INDICES.RIGHT_ELBOW,
        wrist: LANDMARK_INDICES.RIGHT_WRIST,
        hip: LANDMARK_INDICES.RIGHT_HIP,
    },
    {
        name: "片足立ち (右足軸)",
        message: "【チャレンジ3/3】右足で立ち、左足を曲げて両手を挙げてください。",
        targetType: 'LEG_BALANCE', // 評価タイプ: 下半身の安定性
        evalJoints: ['R_KNEE', 'HIP_TILT'], // 評価する関節群: 軸足の膝と体幹の傾き
        score: null,
        // ARMチャレンジと互換性のない関節は null または使用しない
    }
];

// その他の共通定数
export const TARGET_ANGLES = {
    ELBOW: 170, 
    SHOULDER: 170, 
    KNEE_STRAIGHT: 170, // 軸足の膝の伸び目標
};

export const TOLERANCE = {
    ELBOW: 10,  
    SHOULDER: 15, 
    KNEE: 10, // 膝の許容誤差
    TILT: 5, // 体幹の傾きの許容誤差 (5度まで許容)
    START_TOLERANCE: 20,
};

export const LANDMARKS = LANDMARK_INDICES;