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
        imageSrc: './images/posePikt/挙手.png', 
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
        imageSrc: './images/posePikt/両腕L字.png', 
    },
    // 剣を構えるポーズ (右腕のみ判定に変更)
    {
        id: 'SWORD_POSE',
        name: "剣を構えるポーズ (右腕のみ)",
        message: "【T字スタート】右腕で剣を構えるポーズを維持してください。",
        targetType: 'SINGLE_SWORD_POSE',
        // 評価対象: 右肩と右肘のみに限定
        evalJoints: ['R_SHOULDER', 'R_ELBOW'], 
        requiredStartPose: 'T_POSE',
        imageSrc: './images/posePikt/右手上げ.png', 
    },
    // 剣の握りポーズ
    {
        id: 'SWORD_GRIP_POSE',
        name: "スローインポーズ",
        message: "【T字スタート】両腕を水平よりやや下に下げ、肘を曲げてビームポーズを維持してください。",
        targetType: 'SWORD_GRIP', // 新しい評価タイプ
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], // 両肩と両肘
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/両手剣.png', // 新しい画像 (仮)
    },
    // 頭上での屈曲ポーズ
    {
        id: 'HIGH_SIDE_BEND_POSE',
        name: "大剣を振りかざすポーズ",
        message: "【T字スタート】両腕を頭上に上げて肘を曲げ、体幹を大きく傾けて剣を握るようにしてください。",
        targetType: 'SIDE_BEND_ARMS', // 新しい評価タイプ
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/光線.png', // 新しい画像 (仮)
    },
    // ARCHERY_POSE
    {
        id: 'ARCHERY_POSE',
        name: "弓引きポーズ",
        message: "【T字スタート】右肘を曲げて頭の後ろに、左腕を水平に伸ばしてポーズを維持してください。",
        targetType: 'ASYM_ARCHERY_ARMS', // 新しい評価タイプ
        evalJoints: ['L_SHOULULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/弓引き改.png', // 新しい画像 (仮)
    },
    // 敬礼ポーズ
    {
        id: 'SALUTE_POSE',
        name: "敬礼ポーズ",
        message: "【T字スタート】右腕を曲げて敬礼の形に、左腕は自然に下げてポーズを維持してください。",
        targetType: 'ASYM_SALUTE_ARMS', // 新しい評価タイプ
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/敬礼.png', // 新しい画像 (仮)
    },
    // びっくりした人ポーズ
    {
        id: 'SURPRISE_POSE',
        name: "びっくりした人ポーズ",
        message: "【T字スタート】両腕を水平より少し上に上げ、肘を曲げて手のひらを頭の横に近づけるポーズを維持してください。",
        targetType: 'SURPRISE_ARMS', // 新しい評価タイプ
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/びっくり.png', // 新しい画像 (仮)
    },
    // 忠誠を誓う人ポーズ
    // {
    //     id: 'OATH_POSE',
    //     name: "忠誠を誓う人ポーズ",
    //     message: "【T字スタート】右腕を前方に、左腕を腰に添えるポーズを維持してください。",
    //     targetType: 'ASYM_OATH_ARMS', // 新しい評価タイプ
    //     evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
    //     requiredStartPose: 'T_POSE', 
    //     imageSrc: './images/oath_pose_overlay.png', // 新しい画像 (仮)
    // },
    // FUSION_POSE
    // {
    //     id: 'FUSION_POSE',
    //     name: "フュージョンポーズ",
    //     message: "【T字スタート】両腕を体の前に突き出し、人差し指を近づけてポーズを維持してください。",
    //     targetType: 'FUSION_ARMS', // 新しい評価タイプ
    //     evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
    //     requiredStartPose: 'T_POSE', 
    //     imageSrc: './images/fusion_pose_overlay.png', // 新しい画像 (仮)
    // },

    {
        id: 'LEFT_ARM_UP_RIGHT_ARM_DOWN',
        name: "腕上げポーズ",
        message: "【T字スタート】両手を上げて腰を曲げてみてください。",
        targetType: 'ASYM_ARMS_UP_DOWN', // 新しい評価タイプ
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'R_SHOULDER', 'R_ELBOW'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/非対象の片腕.png', // 新しい画像 (仮)
    },
    
    // ★ 追加: 自慢する人ポーズ
    {
        id: 'JIMAN_POSE',
        name: "自慢する人(コロンビア)ポーズ",
        message: "【T字スタート】両手を腰に当て、胸を張ってポーズを維持してください。",
        targetType: 'JIMAN_ARMS', // 新しい評価タイプ
        // 評価対象に股関節（L_HIP, R_HIP）を追加
        evalJoints: ['L_SHOULDER', 'L_ELBOW', 'L_HIP', 'R_SHOULDER', 'R_ELBOW', 'R_HIP'], 
        requiredStartPose: 'T_POSE', 
        imageSrc: './images/posePikt/自慢改.png', // 新しい画像
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
    
    // 腕を下ろすポーズの目標角度（垂直）
    ARM_DOWN: 170, 
    
    // T字ポーズ
    T_POSE_SHOULDER: 90, 
    T_POSE_ELBOW: 170, 
    
    // SWORD_POSE の目標角度 
    SWORD_SHOULDER: 100,     
    SWORD_ELBOW: 160,        
    
    // SWORD_GRIP_POSE の目標角度 
    GRIP_SHOULDER: 120,      
    GRIP_ELBOW: 90,          

    // HIGH_SIDE_BEND_POSE の目標角度 (非対称)
    SIDE_BEND_SHOULDER: 160, 
    SIDE_BEND_R_ELBOW: 70,   
    SIDE_BEND_L_ELBOW: 85,   
    
    // ARCHERY_POSE の目標角度
    ARCHERY_R_SHOULDER: 165, 
    ARCHERY_R_ELBOW: 60,     
    ARCHERY_L_SHOULDER: 90,  
    ARCHERY_L_ELBOW: 170,    
    
    // SALUTE_POSE の目標角度
    SALUTE_R_SHOULDER: 100, // 敬礼腕: 水平より少し上
    SALUTE_R_ELBOW: 50,     // 敬礼腕: 鋭角に曲げる
    SALUTE_L_SHOULDER: 175, // 下げ腕: ほぼまっすぐ下
    SALUTE_L_ELBOW: 170,    // 下げ腕: ほぼまっすぐ

    // SURPRISE_POSE の目標角度 (両腕共通)
    SURPRISE_SHOULDER: 100, // 肩: 水平より少し上
    SURPRISE_ELBOW: 60,     // 肘: かなり曲げる
    
    // OATH_POSE の目標角度
    OATH_R_SHOULDER: 90,    // 右腕 (突き出し): 水平
    OATH_R_ELBOW: 170,      // 右腕 (突き出し): ほぼまっすぐ
    OATH_L_SHOULDER: 120,   // 左腕 (腰に添える): 水平より少し下
    OATH_L_ELBOW: 90,       // 左腕 (腰に添える): 直角
    
    // FUSION_POSE の目標角度 (両腕共通)
    FUSION_SHOULDER: 70,    // 肩: 水平より前に突き出す
    FUSION_ELBOW: 110,      // 肘: 大きく曲げる

    UP_DOWN_L_SHOULDER: 170, // 左腕: 垂直
    UP_DOWN_L_ELBOW: 170,    // 左腕: まっすぐ
    UP_DOWN_R_SHOULDER: 140, // 右腕: 斜め下
    UP_DOWN_R_ELBOW: 170,    // 右腕: まっすぐ
    
    // ★ 追加: JIMAN_POSE の目標角度
    JIMAN_SHOULDER: 120,     // 肩: 腰に手を当てるため、水平より少し下 (120度)
    JIMAN_ELBOW: 90,         // 肘: 腰に手を当てるため、直角 (90度)
    JIMAN_HIP: 175,          // 股関節: 体幹を真っ直ぐに維持 (175度)
    JIMAN_TILT: 10,          // 体幹傾き: 垂直からの許容誤差 (10度)

};

export const TOLERANCE = {
    // 全ての汎用許容誤差を 30 に維持
    ELBOW: 30,  
    SHOULDER: 30, 
    KNEE: 30, 
    TILT: 30, 
    
    // 各ポーズの許容誤差を 30/40/60 にて維持
    L_SHAPE_TOLERANCE: 30, 
    ARM_DOWN_TOLERANCE: 30, 
    START_TOLERANCE_VERTICAL: 30, 
    START_TOLERANCE_T_POSE: 30, 
    DASH_TOLERANCE: 30, 

    // SWORD_POSE の許容誤差
    SWORD_TOLERANCE: 30, 
    
    // SWORD_GRIP_POSE の許容誤差
    GRIP_TOLERANCE: 40,      
    
    // SIDE_BEND_ARMS の許容誤差
    SIDE_BEND_TOLERANCE: 60,
    
    // ARCHERY_POSE の許容誤差
    ARCHERY_TOLERANCE: 60,
    
    // SALUTE_POSE の許容誤差
    SALUTE_TOLERANCE: 50,
    
    // SURPRISE_POSE の許容誤差
    SURPRISE_TOLERANCE: 40, 
    
    // OATH_POSE の許容誤差
    OATH_TOLERANCE: 60, 
    
    // FUSION_POSE の許容誤差
    FUSION_TOLERANCE: 40, // 40度を設定
    
    ASYM_UP_DOWN_TOLERANCE: 40,
    
    // ★ 追加: JIMAN_POSE の許容誤差
    JIMAN_TOLERANCE: 40,     // 腕の関節角度の許容誤差
    JIMAN_HIP_TOLERANCE: 15, // 股関節角度の許容誤差 (厳しめに設定)
    JIMAN_TILT_TOLERANCE: 10, // 体幹の傾き許容誤差 (厳しめに設定)
};

export const LANDMARKS = LANDMARK_INDICES;