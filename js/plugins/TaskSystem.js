/*:
 * @plugindesc 任务系统插件（支持滚动及底部提示）
 *
 * @author Isuncy
 *
 * @help
 * 插件说明
 *
 * 插件命令:
 * FinishTask [任务名称] - 完成任务并获取奖励
 * AddMainTask [任务名称] [任务内容] [奖励] - 添加一个主线任务（玩家不可拒绝）
 * AddNormalTask [任务名称] [任务内容] [奖励] - 添加一个普通任务（玩家可选择是否拒绝）
 * RefuseIfNotFinish [任务名称] - 指定方格事件，如果任务未完成，则阻止玩家到达该方格
 *
 * 注意任务名称必须唯一，且每个参数中不能包含空白字符
 *
 * 使用说明:
 * - 按T键打开/折叠任务窗口
 * - 当任务数量超过窗口高度时，可以使用鼠标滚轮或键盘方向键滚动查看
 * - 当窗口未滚动到底部时，底部会显示倒三角提示
 */

var abc = abc || {};

abc.Parameters = PluginManager.parameters('TaskSystem');

var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;

(function() {
    console.log('任务系统插件已加载');
    Input.keyMapper[84] = 't'; // 设置T键为任务窗口快捷键

    // 扩展Game_System存储任务数据
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
    this.padding = 10;
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
    const padding = 10;
    const lineHeight = this.lineHeight();
    const width = this.contents.width;

    // 标题高度
    const titleHeight = lineHeight;

    // 内容高度
    const contentLines = this.wrapText(task.value.context, width);
    // const contentHeight = Math.min(contentLines.length, 4) * lineHeight; // 最多显示4行
    const contentHeight = contentLines.length * lineHeight;


    // 总高度 = 上下padding + 标题高度 + 内容高度 + 奖励高度
    return padding * 2 + titleHeight + contentHeight + lineHeight;
};

// 获取每个任务项的矩形区域（考虑滚动位置）
Window_TaskList.prototype.itemRect = function(index) {
    const rect = new Rectangle();
    const spacing = 8;

    rect.width = this.contents.width;
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

// 绘制每一项
Window_TaskList.prototype.drawItem = function(index) {
    const task = $gameSystem.getTaskList()[index];
    if (!task) return;

    const rect = this.itemRect(index);
    const padding = 10;
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
    const contentWidth = rect.width - padding * 2;
    const contentY = rect.y + padding + lineHeight;
    const contentLines = this.wrapText(task.value.context, contentWidth);

    // 最多显示4行内容
    const maxContentLines = 4;
    for (let i = 0; i < Math.min(contentLines.length, maxContentLines); i++) {
        const y = contentY + i * lineHeight;
        this.drawTextEx(`\\C[22]${contentLines[i]}`, rect.x + padding, y);
    }

    // 如果内容超过4行，显示省略号
    if (contentLines.length > maxContentLines) {
        const lastLineY = contentY + (maxContentLines - 1) * lineHeight;
        this.drawTextEx(`\\C[22]...`, rect.x + padding, lastLineY);
    }

    // 绘制奖励（底部）
    const rewardY = rect.y + rect.height - padding - lineHeight;
    this.drawTextEx(`\\C[20]奖励：${task.value.reward}G`, rect.x + padding, rewardY);
};

// 改进的文本自动换行逻辑
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
    // this.contents.fillRect(0, 0, this.width , this._titleHeight, 'rgba(255,255,255, 0.2)');
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
    let totalHeight = 0;

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

    // 调试信息 - 显示滚动位置
    // console.log(`ScrollY: ${this._scrollY}, ScrollMax: ${this._scrollMax}`);
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
        if (this._scrollY < this._scrollMax) {
            //在底部绘制滚动提示（文字倒三角）
            this.drawTextEx(`\\C[18]▼`, this.contents.width - this.padding - this.textWidth('▼'), this.height - this.padding - this.lineHeight() - 18, this.textWidth('▼'), 'left');
        }
    }
    // this.contents.fillRect(0, 0, this.width , this._titleHeight, 'rgba(255,255,255, 0.2)');
    // 重新绘制标题
    this.drawTextEx(`任务列表(T)[${$gameSystem.getTaskList().length}个]`, 0, 0, this.contents.width, 'center');
};

// 插件命令处理
Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command === 'AddMainTask') {
        const taskName = args[0];
        const taskContext = args[1];
        const taskReward = args[2];

        if (taskName && taskContext && taskReward) {
            const fullTaskName = '[主线]' + taskName;
            if ($gameSystem.getTaskData(fullTaskName)) {
                return;
            }

            $gameSystem.setTaskData(fullTaskName, {
                context: taskContext,
                reward: taskReward
            });

            $gameMessage.add(`接取任务: \\C[24]${taskName}\\C[0]\n完成奖励: ${taskReward}G`);
            if (SceneManager._scene && SceneManager._scene._taskWindow) {
                SceneManager._scene._taskWindow.refresh();
            }
        } else {
            $gameMessage.add('请提供任务名称、内容和奖励。格式: AddTask 任务名称 任务内容 奖励');
        }
    }

    if (command === 'FinishTask') {
        const taskName = args[0];

        if (taskName) {
            let taskData = $gameSystem.getTaskData('[主线]'+taskName);
            let fullTaskName = '[主线]'+taskName;
            if (!taskData) {
                taskData = $gameSystem.getTaskData('[支线]'+taskName);
                fullTaskName = '[支线]'+taskName;
            }

            if (taskData) {
                $gameMessage.add(`完成任务: \\C[24]${taskName}\\C[0]，奖励: ${taskData.reward}金币`);
                $gameParty.gainGold(parseInt(taskData.reward));
                $gameSystem.deleteTask(fullTaskName);
                if (SceneManager._scene && SceneManager._scene._taskWindow) {
                    SceneManager._scene._taskWindow.refresh();
                }
            } else {
                $gameMessage.add(`找不到任务: ${taskName}`);
            }
        } else {
            $gameMessage.add('请提供要完成的任务名称。');
        }
    }

    if (command === 'AddNormalTask') {
        const taskName = args[0];
        const taskContext = args[1];
        const taskReward = args[2];

        if (taskName && taskContext && taskReward) {
            const fullTaskName = '[支线]' + taskName;
            if ($gameSystem.getTaskData(fullTaskName)) {
                return;
            }

            $gameMessage.add(`新增支线任务:\\C[24] ${taskName}\\C[0]\n奖励: ${taskReward}G\n是否接取支线任务：\\C[24]${taskName}\\C[0]？`);
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
            $gameMessage.add('请提供任务名称、内容和奖励。格式: AddNormalTask 任务名称 任务内容 奖励');
        }
    }

    if (command === 'RefuseIfNotFinish') {
        const taskName = args[0];
        if (taskName) {
            let taskData = $gameSystem.getTaskData('[主线]'+taskName);
            if (!taskData) {
                taskData = $gameSystem.getTaskData('[支线]'+taskName);
            }
            if (taskData) {
                $gameMessage.add(`任务 \\C[24]${taskName}\\C[0] 未完成，无法通过此处。`);
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