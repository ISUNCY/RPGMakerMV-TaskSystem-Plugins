/*:
 * @plugindesc 任务系统插件
 *
 * @author Isuncy
 *
 * @help
 * 插件说明
 * 注意：
 * - 插件命令中的方括号在实际输入时是无需输入的。
 * - 如果输入的任务名称或内容中包含空格，请使用双引号将其括起来。
 * - 任务名称必须唯一
 * - 命令中参数可以换位置，可选参数可以不填，例如FinishTask /n 任务名称 /g 1000，也可以写成 FinishTask /g 1000 /n 任务名称（但不建议随意调换顺序）
 * 插件命令:
 *
 * AddMainTask /n [任务名称] /c [任务内容] /r [奖励内容（奖励介绍）]   - 添加一个主线任务（玩家不可拒绝）
 *
 * AddNormalTask /n [任务名称] /c [任务内容] /r [奖励内容（奖励介绍）] - 添加一个普通任务（玩家可选择是否拒绝）
 *
 * FinishTask /n [任务名称]
 *    可选参数如下:
 *      /g [奖励金额(数字)]
 *      /i [奖励物品编号] [奖励数量]
 *      /w [奖励武器编号] [奖励数量]
 *      /a [奖励护甲编号] [奖励数量]
 * 若有其他奖励方式，请自行添加事件指令
 *
 * RefuseIfNotFinish [任务名称] - 指定方格事件，如果任务未完成，则阻止玩家到达该方格
 *
 * 以上命令中的等价形式（可互相替换）：
 *      /n 可替换为 /name 或 /任务名称
 *      /c 可替换为 /context 或 /任务内容
 *      /r 可替换为 /reward 或 /奖励内容
 *      /g 可替换为 /gold 或 /金币
 *      /m 可替换为 /item 或 /物品
 *      /w 可替换为 /weapon 或 /武器
 *      /a 可替换为 /armor 或 /护甲
 *
 * 使用说明:
 * - 按T键打开/折叠任务窗口
 * - 当任务数量超过窗口高度时，可以使用鼠标滚轮或键盘方向键滚动查看
 * - 当窗口未滚动到底部时，底部会显示倒三角提示
 */

var isuncy = isuncy || {};

isuncy.Parameters = PluginManager.parameters('TaskSystem');

var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;

Input.keyMapper[84] = 't'; // 设置T键为任务窗口快捷键

// 扩展Game_System存储任务数据
(function() {
    console.log('任务系统插件已加载');

    const _Game_System_initialize = Game_System.prototype.initialize;

    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this.taskData = {};
    };

    Game_System.prototype.setTaskData = function(key, value) {
        this.taskData[key] = value;
    };

    Game_System.prototype.getTaskList = function() {
        return Object.keys(this.taskData).map(key => ({
            key: key,
            value: this.taskData[key]
        }));
    };

    Game_System.prototype.getTaskData = function(key) {
        return this.taskData[key];
    };

    Game_System.prototype.deleteTask = function(key) {
        delete this.taskData[key];
    };
})();

// 扩展场景地图类，添加任务窗口
var old_Scene_Map_start = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    old_Scene_Map_start.call(this);
    this.createTaskWindow();
};

const _Scene_Map_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    _Scene_Map_update.call(this);
    if (Input.isTriggered('t') && this._taskWindow) {
        // 切换任务窗口的折叠/展开状态
        this._taskWindow._collapsed = !this._taskWindow._collapsed;
        if (this._taskWindow._collapsed) {
            this._taskWindow.height = 60;
        } else {
            this._taskWindow.height = 400;
            // 展开时重置滚动位置
            this._taskWindow._scrollY = 0;
        }
        this._taskWindow.refresh();
    }
    if (this._taskWindow && this._taskWindow.visible) {
        this._taskWindow.update();
    }
};

Scene_Map.prototype.createTaskWindow = function() {
    const rect = this.taskWindowRect();
    this._taskWindow = new Window_TaskList(rect);
    this.addWindow(this._taskWindow);

    // 初始化为折叠状态
    this._taskWindow._collapsed = true;
    this._taskWindow.height = 60;
};

Scene_Map.prototype.taskWindowRect = function() {
    const ww = 300;
    const wh = 400;
    const wx = Graphics.boxWidth - ww; // 屏幕右边
    const wy = 0;
    return new Rectangle(wx, wy, ww, wh);
};

// 任务列表窗口类（支持滚动）
function Window_TaskList() {
    this.initialize.apply(this, arguments);
}

Window_TaskList.prototype = Object.create(Window_Selectable.prototype);
Window_TaskList.prototype.constructor = Window_TaskList;

// 初始化窗口
Window_TaskList.prototype.initialize = function(rect) {
    // 初始高度为折叠高度
    Window_Selectable.prototype.initialize.call(this, rect.x, rect.y, rect.width, rect.height);
    this._lastTaskCount = -1;
    this._collapsed = true; // 初始状态为折叠

    // 滚动相关属性
    this._scrollY = 0;
    this._scrollMax = 0;
    this._scrollSpeed = 3; // 滚动速度

    // 创建内容区域
    this.createContents();
    this.contents.fontSize = 15; // 设置字体大小
    this.padding = 12; // 减小内边距
    this._itemHeights = []; // 存储每个任务项的高度

    // 标题区域高度
    this._titleHeight = this.lineHeight() + this.padding * 2;

    this.refresh(); // 确保刷新在初始化后执行
};

// 返回任务总数
Window_TaskList.prototype.maxItems = function() {
    return $gameSystem.getTaskList().length;
};

// 获取每个任务项的高度（动态计算）
Window_TaskList.prototype.itemHeight = function(index) {
    if (!this._itemHeights || this._itemHeights.length === 0) {
        return 120; // 默认高度
    }
    if (index < 0 || index >= this._itemHeights.length) {
        return 120; // 默认高度
    }
    return this._itemHeights[index];
};

// 计算每个任务项所需的高度
Window_TaskList.prototype.calculateItemHeight = function(task) {
    const padding = this.padding;
    const lineHeight = this.lineHeight();
    const width = this.contents.width - padding * 2;  // 使用内容区域宽度减去左右padding

    // 标题高度
    const titleHeight = lineHeight;

    // 内容高度
    const contentLines = this.wrapText(task.value.context, width);
    const contentHeight = contentLines.length * lineHeight;

    // 奖励高度
    const rewardLines = this.wrapText("[奖励]"+task.value.reward, width);
    const rewardHeight = rewardLines.length * lineHeight;

    // 添加内容与奖励之间的间距
    const spacing = 10;

    // 总高度 = 上下padding + 标题高度 + 内容高度 + 奖励高度 + 间距
    return padding * 2 + titleHeight + contentHeight + rewardHeight + spacing;
};

// 获取每个任务项的矩形区域
Window_TaskList.prototype.itemRect = function(index) {
    const rect = new Rectangle();
    const spacing = 8;

    rect.width = this.contents.width; // 减去左右padding
    rect.x = this.padding;

    // 计算y位置（基于之前所有项的高度）
    rect.y = this._titleHeight; // 从标题下方开始

    for (let i = 0; i < index; i++) {
        const itemHeight = this._itemHeights[i] || 120;
        rect.y += itemHeight + spacing;
    }

    // 应用滚动偏移
    rect.y -= this._scrollY;

    rect.height = this.itemHeight(index);
    return rect;
};

// 绘制每一项 - 添加奖励内容换行支持
Window_TaskList.prototype.drawItem = function(index) {
    const task = $gameSystem.getTaskList()[index];
    if (!task) return;

    const rect = this.itemRect(index);
    const padding = this.padding;
    const lineHeight = this.lineHeight();

    // 如果任务项完全在可见区域之外，则跳过绘制
    if (rect.y + rect.height < 0 || rect.y > this.height) {
        return;
    }

    // 绘制背景 - 使用简单颜色
    this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, 'rgba(0, 0, 0, 0.2)');

    // 绘制任务名称（顶部）
    this.drawTextEx(`\\C[24]${task.key}`, rect.x + padding, rect.y + padding);

    // 绘制任务内容（中间）
    const contentWidth = rect.width-50;
    const contentY = rect.y + padding + lineHeight;
    const contentLines = this.wrapText(task.value.context, contentWidth);

    // 绘制所有内容行
    for (let i = 0; i < contentLines.length; i++) {
        const y = contentY + i * lineHeight;
        this.drawTextEx(`\\C[22]${contentLines[i]}`, rect.x + padding, y);
    }

    // 绘制奖励（底部） - 添加换行支持
    const rewardLines = this.wrapText("[奖励]"+task.value.reward, contentWidth);
    // 计算内容部分的总高度
    const contentHeight = contentLines.length * lineHeight;
    // 奖励部分在内容下方添加10像素间距
    const rewardY = contentY + contentHeight + 10;

    for (let j = 0; j < rewardLines.length; j++) {
        const y = rewardY + j * lineHeight;
        this.drawTextEx(`\\C[20]${rewardLines[j]}`, rect.x + padding, y);
    }
};

// 文本自动换行逻辑
Window_TaskList.prototype.wrapText = function(text, maxWidth) {
    if (!text || !maxWidth) return [];
    const lines = [];
    let currentLine = '';

    // 按字符处理，支持中英文混合
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const testLine = currentLine + char;

        // 计算文本宽度
        const width = this.textWidth(testLine);

        if (width <= maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = char;
        }
    }

    if (currentLine !== '') {
        lines.push(currentLine);
    }

    return lines;
};

// 刷新窗口内容
Window_TaskList.prototype.refresh = function() {
    // 确保内容区域已创建
    if (!this.contents) {
        this.createContents();
        this.contents.fontSize = 15;
    }

    this.contents.clear();

    // 绘制标题（始终固定在顶部）
    this.drawTextEx(`任务列表(T)[${$gameSystem.getTaskList().length}个]`, 0, 0, this.contents.width, 'center');

    // 只有在展开状态下才处理任务项
    if (!this._collapsed) {
        // 计算每个任务项的高度
        this._itemHeights = [];
        const tasks = $gameSystem.getTaskList();

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (task) {
                this._itemHeights.push(this.calculateItemHeight(task));
            } else {
                this._itemHeights.push(120);
            }
        }

        // 计算总高度并设置滚动范围
        this.calculateScrollRange();

        for (let i = 0; i < this.maxItems(); i++) {
            this.drawItem(i);
        }
    }
};

// 计算滚动范围（确保底部有足够空间）
Window_TaskList.prototype.calculateScrollRange = function() {
    const spacing = 8;
    let totalHeight = this._titleHeight;

    for (let i = 0; i < this._itemHeights.length; i++) {
        totalHeight += this._itemHeights[i] + spacing;
    }

    // 计算最大滚动值（减去标题高度和窗口可视高度，再加一些底部边距）
    const visibleHeight = this.height - this._titleHeight;
    this._scrollMax = Math.max(0, totalHeight - visibleHeight + this.padding * 2);
};

// 更新窗口
Window_TaskList.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);

    // 处理滚动输入
    if (!this._collapsed) {
        this.processScroll();
    }

    // 任务数据变化时刷新窗口
    if (this._lastTaskCount !== $gameSystem.getTaskList().length) {
        this.refresh();
        this._lastTaskCount = $gameSystem.getTaskList().length;
    }
};

// 处理滚动输入
Window_TaskList.prototype.processScroll = function() {
    // 鼠标滚轮滚动
    if (TouchInput.wheelY !== 0) {
        this._scrollY += TouchInput.wheelY * this._scrollSpeed * 0.05; // 调整滚动速度
        TouchInput.wheelY = 0;
    }

    // 键盘上下键滚动
    if (Input.isRepeated('down')) {
        this._scrollY += this._scrollSpeed;
    }
    if (Input.isRepeated('up')) {
        this._scrollY -= this._scrollSpeed;
    }

    // 限制滚动范围
    this._scrollY = this._scrollY.clamp(0, this._scrollMax);

    // 如果有滚动发生，刷新显示
    if (this._scrollY !== this._prevScrollY) {
        this.refreshContents();
        this._prevScrollY = this._scrollY;
    }
};

// 刷新内容区域（解决标题花屏问题）
Window_TaskList.prototype.refreshContents = function() {
    // 清除整个内容区域
    this.contents.clear();

    // 只有在展开状态下才绘制任务项
    if (!this._collapsed) {
        for (let i = 0; i < this.maxItems(); i++) {
            this.drawItem(i);
        }

        // 添加底部滚动提示（倒三角）
        if (this._scrollY < this._scrollMax) {
            //在底部绘制滚动提示（文字倒三角）
            this.drawTextEx(`\\C[18]▼`, this.contents.width - this.padding - this.textWidth('▼'), this.height - this.padding - this.lineHeight() - 18, this.textWidth('▼'), 'left');
        }
    }
    // 重新绘制标题
    this.drawTextEx(`任务列表(T)[${$gameSystem.getTaskList().length}个]`, 0, 0, this.contents.width, 'center');
};


// 插件命令处理
Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);

    /**
     * 添加主线任务详情
     */
    if (command === 'AddMainTask') {

        let parser = new commandParser(args);
        const taskName = parser.getCommand(['n','name','任务名称'], {reusable: false, maxCount: 1}).first;
        const taskContext = parser.getCommand(['c','context','任务内容'], {reusable: false, maxCount:1}).first;
        const taskReward = parser.getCommand(['r','reward','奖励内容', "奖励介绍"], {reusable: false, maxCount:1}).first;

        console.log(taskName);
        console.log('test');

        if (taskName && taskContext && taskReward) {
            const fullTaskName = '[主线]' + taskName;
            if ($gameSystem.getTaskData(fullTaskName)) {
                return;
            }

            $gameSystem.setTaskData(fullTaskName, {
                context: taskContext,
                reward: taskReward
            });

            $gameMessage.add(`接取任务: \\C[24]${taskName}\\C[0]\n完成奖励: \\C[20]${taskReward}\\C[0]`);
            if (SceneManager._scene && SceneManager._scene._taskWindow) {
                SceneManager._scene._taskWindow.refresh();
            }
        } else {
            $gameMessage.add('格式错误或字段不全');
        }
    }

    /**
     * 完成任务，并获得奖励
     */
    if (command === 'FinishTask') {

        let parser = new commandParser(args);
        const taskName = parser.getCommand(['n','name','任务名称'], {reusable: false, maxCount: 1}).first;
        const goldReward = parser.getCommand(['g','gold','金币'], {reusable: false, maxCount: 1}).first;
        const itemReward = parser.getCommand(['i', 'item', '物品'], {reusable: true, maxCount: 2}).all;
        const weaponReward = parser.getCommand(['w', 'weapon', '武器'], {reusable: true, maxCount: 2}).all;
        const armorReward = parser.getCommand(['a', 'armor', '护甲'], {reusable: true, maxCount: 2}).all;

        if (taskName) {
            let taskData = $gameSystem.getTaskData('[主线]'+taskName);
            let fullTaskName = '[主线]'+taskName;
            if (!taskData) {
                taskData = $gameSystem.getTaskData('[支线]'+taskName);
                fullTaskName = '[支线]'+taskName;
            }
            if (taskData) {
                $gameMessage.add(`完成任务: \\C[24]${taskName}\\C[0]\n获得奖励: \\C[20]${taskData.reward}`);
                if (goldReward !== undefined && isNaN(goldReward)) {
                    $gameParty.gainGold(parseInt(goldReward));
                }
                if (itemReward) {
                    for (let i = 0; i < itemReward.length; i++) {
                        let item = itemReward[i];
                        const itemId = parseInt(item[0]);
                        const itemCount = parseInt(item[1]) || 1;
                        $gameParty.gainItem($dataItems[itemId], itemCount);
                    }
                }
                if (weaponReward) {
                    for (let i = 0; i < weaponReward.length; i++) {
                        let weapon = weaponReward[i];
                        const weaponId = parseInt(weapon[0]);
                        const weaponCount = parseInt(weapon[1]) || 1;
                        $gameParty.gainItem($dataWeapons[weaponId], weaponCount);
                    }
                }
                if (armorReward) {
                    for (let i = 0; i < armorReward.length; i++) {
                        let armor = armorReward[i];
                        const armorId = parseInt(armor[0]);
                        const armorCount = parseInt(armor[1]) || 1;
                        $gameParty.gainItem($dataArmors[armorId], armorCount);
                    }
                }
                $gameSystem.deleteTask(fullTaskName);
                if (SceneManager._scene && SceneManager._scene._taskWindow) {
                    SceneManager._scene._taskWindow.refresh();
                }
            }
        } else {
            $gameMessage.add('格式错误或字段不全');
        }
    }

    /**
     * 添加支线任务详情
     */
    if (command === 'AddNormalTask') {
        let parser = new commandParser(args);
        const taskName = parser.getCommand(['n','name','任务名称'], {reusable: false, maxCount: 1}).first;
        const taskContext = parser.getCommand(['c','context','任务内容'], {reusable: false, maxCount:1}).first;
        const taskReward = parser.getCommand(['r','reward','奖励内容', "奖励介绍"], {reusable: false, maxCount:1}).first;

        if (taskName && taskContext && taskReward) {
            const fullTaskName = '[支线]' + taskName;
            if ($gameSystem.getTaskData(fullTaskName)) {
                return;
            }

            $gameMessage.add(`新增支线任务: \\C[24] ${taskName}\\C[0]\n奖励: \\C[20]${taskReward}\\C[0] \n是否接取支线任务：\\C[24]${taskName}\\C[0]？`);
            $gameMessage.setChoices(['接取', '放弃']);
            $gameMessage.setChoiceCallback(function(choice) {
                if (choice === 0) { // 接取
                    $gameSystem.setTaskData(fullTaskName, {
                        context: taskContext,
                        reward: taskReward
                    });
                    $gameMessage.add(`你已接取任务: \\C[24]${taskName}`);
                    if (SceneManager._scene && SceneManager._scene._taskWindow) {
                        SceneManager._scene._taskWindow.refresh();
                    }
                } else { // 放弃
                    $gameSystem.deleteTask(fullTaskName);
                    $gameMessage.add(`你已放弃任务: \\C[24]${taskName}\\C[0]`);
                }
            });
        } else {
            $gameMessage.add('格式错误或字段不全');
        }
    }

    /**
     * 如果任务未完成，则阻止玩家到达指定方格
     */
    if (command === 'RefuseIfNotFinish') {

        // const cmds = new isuncy.CommandUtils(args);
        // const taskName = cmds.getCmds(['default', 'n', 'name', '任务名称'], NON_REUSABLE, 1);

        let parser = new commandParser(args);
        const taskName = parser.getCommand(['default','n','name','任务名称'], {reusable: false, maxCount: 1}).first;

        if (taskName) {
            let taskData = $gameSystem.getTaskData('[主线]'+taskName);
            if (!taskData) {
                taskData = $gameSystem.getTaskData('[支线]'+taskName);
            }
            if (taskData) {
                $gameMessage.add(`任务 \\C[24]${taskName}\\C[0] 还未完成，完成任务后再来探索吧~`);
                // 阻止玩家移动到该方格
                $gamePlayer.moveBackward(1);
                return false;
            }
        } else {
            $gameMessage.add('请提供任务名称。');
        }
        return true;
    }
};


//命令处理工具类（上版写的一言难尽 重构一下）
class commandParser {
    constructor(args) {
        this.commands = this._parser(args);
    }

    _parser(args) {
        let commands = {"default":[[]]};
        let inQuote = false;
        let current = 'default';
        let buffer = '';
        for (let arg of args) {
            if (arg.startsWith('/') && !inQuote) {
                current = arg.slice(1);
                commands[current] = commands[current] || [];
                commands[current].push([]);
                continue;
            }
            for (let i = 0; i < arg.length; i++) {
                if (arg[i] === '"') {
                    inQuote = !inQuote;
                    if (inQuote === false) break;
                    continue;
                }
                buffer += arg[i];
            }
            if (!inQuote) {
                commands[current][commands[current].length-1].push(buffer);
                buffer = "";
            }
            else {
                buffer += " ";
            }
        }
        console.log(commands);
        return commands;
    }

    getCommand(keys, options) {
        const {
            reusable = false,
            maxCount = Infinity
        } = options;
        let result = [];
        for (let key of keys) {
            if (this.commands[key]) {
                result.push(...this.commands[key].slice(0,maxCount));
            }
        }
        return new commandResult(result, !reusable);
    }
}

class commandResult {
    constructor(args, isSingle) {
        this.isSingle = isSingle;
        this.args = args;
    }
    get all () {
        if (this.args.length === 0) return null;
        return this.isSingle ? [this.args[0]] : this.args;
    }
    get first () {
        if (this.args.length === 0) return null;
        if (this.args[0].length > 0) {
            return this.isSingle ? this.args[0][0]||null : null;
        }
        return null;
    }
}

// //命令处理工具类
//
// isuncy.cmd = function() {
//     this.number = 0;
//     this.args = [];
//     this.addCmdNumber = function () {
//         this.number++;
//         this.args.push([])
//     }
//     this.getCmdNumber = function () {
//         return this.number;
//     }
//     this.getArgs = function (index) {
//         return this.args[index]
//     }
//     this.addArg = function (index, arg) {
//         this.args[index].push(arg);
//     }
// }
//
// isuncy.CommandUtils = function (args){
//     this.ReusableType = {
//         REUSABLE : "可重复",
//         NON_REUSABLE : "不可重复"
//     }
//
//     this.parseArgs = function (args) {
//         let cmds = {};
//         let currentPos = 0;
//         let currentKey = 'default'
//         cmds[currentKey] = new isuncy.cmd(currentKey);
//         cmds[currentKey].addCmdNumber();
//         while (currentPos !== args.length) {
//             let arg = args[currentPos];
//             if (arg.startsWith('/')) {
//                 currentKey = arg.slice(1);
//                 if (cmds[currentKey]) {
//                     cmds[currentKey].addCmdNumber();
//                 }
//                 else {
//                     cmds[currentKey] = new isuncy.cmd(currentKey);
//                     cmds[currentKey].addCmdNumber();
//                 }
//             }
//             else {
//                 if (arg.startsWith('"')) {
//                     let str = arg.slice(1);
//                     while (currentPos+1 < args.length && !args[currentPos].endsWith('"')) {
//                         str += " " + args[++currentPos];
//                     }
//                     str = str.slice(0,-1);
//                     cmds[currentKey].addArg(cmds[currentKey].number-1, str);
//                 }
//                 else {
//                     cmds[currentKey].addArg(cmds[currentKey].number-1, arg);
//                 }
//             }
//             currentPos++;
//         }
//         console.log(cmds);
//         return cmds;
//
//     }
//
//     this.cmds = this.parseArgs(args);
//
//     this.getCmds = function (keys, reusableType, argCount) {
//         let cmd = new isuncy.cmd();
//         let haveCmd = false;
//         // console.log(keys);
//         for (let i = 0; i < keys.length; i++) {
//             let key = keys[i];
//             // console.log(key);
//             if (this.cmds[key]) {
//                 // console.log(this.cmds[key]);
//                 haveCmd = true;
//                 for (let j = 0; j < this.cmds[key].args.length; j++) {
//                     let args = this.cmds[key].args[j];
//                     cmd.addCmdNumber();
//                     let count = 0;
//                     for (let k = 0; k < args.length; k++) {
//                         let arg = args[k];
//                         cmd.addArg(cmd.getCmdNumber()-1, arg);
//                         count++;
//                         if (argCount === count) break;
//                     }
//                     if (argCount === 1) {
//                         cmd.args[cmd.getCmdNumber()-1] = cmd.args[cmd.getCmdNumber()-1][0];
//                     }
//                 }
//                 if (reusableType === this.ReusableType.NON_REUSABLE) {
//                     console.log("test");
//                     console.log(cmd.args);
//                     cmd.args = cmd.args[0];
//                     break;
//                 }
//             }
//         }
//         if (!haveCmd) return null;
//         console.log("args:");
//         console.log(cmd.args);
//         return cmd.args;
//     }
    // parseCommandArgs: function(args) {
    //     const result = {};
    //     let currentKey = null;
    //
    //     for (let i = 0; i < args.length; i++) {
    //         const arg = args[i];
    //         if (arg.startsWith('/')) {
    //             // 新的参数键
    //             currentKey = arg.slice(1);
    //             result[currentKey] = [];
    //         } else if (currentKey) {
    //             // 添加值到当前键
    //             if (arg.startsWith('"')) {
    //                 // 处理带引号的参数（可能包含空格）
    //                 let quotedValue = arg.slice(1);
    //                 while (i < args.length - 1 && !args[i].endsWith('"')) {
    //                     i++;
    //                     quotedValue += " " + args[i];
    //                 }
    //                 // 移除结尾引号（如果有）
    //                 if (quotedValue.endsWith('"')) {
    //                     quotedValue = quotedValue.slice(0, -1);
    //                 }
    //                 result[currentKey].push(quotedValue);
    //             } else {
    //                 result[currentKey].push(arg);
    //             }
    //         } else {
    //             // 没有键，可能是任务名称
    //             if (!result['n']) {
    //                 result['n'] = [];
    //             }
    //             result['n'].push(arg);
    //         }
    //     }
    //
    //     // 简化单值数组
    //     for (const key in result) {
    //         if (result[key].length === 1) {
    //             result[key] = result[key][0];
    //         }
    //     }
    //
    //     return result;
    // }
// };