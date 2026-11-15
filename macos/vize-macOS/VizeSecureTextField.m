#import <AppKit/AppKit.h>
#import <React/RCTComponent.h>
#import <React/RCTViewManager.h>

@interface VizePasswordInput : NSSecureTextField
@property (nonatomic, copy) void (^didFocus)(void);
@end

@implementation VizePasswordInput

- (BOOL)becomeFirstResponder {
    BOOL accepted = [super becomeFirstResponder];
    if (accepted && self.didFocus) {
        self.didFocus();
    }
    return accepted;
}

- (void)mouseDown:(NSEvent *)event {
    if (self.didFocus) {
        self.didFocus();
    }
    [super mouseDown:event];
}

@end

@interface VizeSecureFieldView : NSView <NSTextFieldDelegate>
@property (nonatomic, copy) RCTBubblingEventBlock onSecureChange;
@property (nonatomic, copy) RCTBubblingEventBlock onSecureFocus;
@property (nonatomic, copy) RCTBubblingEventBlock onSecureSubmit;
@property (nonatomic, copy) NSString *fieldLabel;
@property (nonatomic, copy) NSString *placeholder;
@property (nonatomic, copy) NSString *value;
@property (nonatomic, strong) NSColor *textColor;
@property (nonatomic, strong) NSColor *placeholderColor;
@property (nonatomic, assign) NSInteger maxLength;
@end

@implementation VizeSecureFieldView {
    VizePasswordInput *_field;
}

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _field = [[VizePasswordInput alloc] initWithFrame:NSZeroRect];
        __weak VizeSecureFieldView *weakSelf = self;
        _field.didFocus = ^{
            [weakSelf reportFocus:YES];
        };
        _field.delegate = self;
        _field.bordered = NO;
        _field.bezeled = NO;
        _field.drawsBackground = NO;
        _field.focusRingType = NSFocusRingTypeNone;
        _field.font = [NSFont systemFontOfSize:13];
        _field.cell.usesSingleLineMode = YES;
        [self addSubview:_field];
    }
    return self;
}

- (void)layout {
    [super layout];
    CGFloat height = ceil(_field.intrinsicContentSize.height);
    _field.frame = NSMakeRect(9, floor((NSHeight(self.bounds) - height) / 2),
                              MAX(0, NSWidth(self.bounds) - 18), height);
}

- (void)mouseDown:(NSEvent *)event {
    [self.window makeFirstResponder:_field];
}

- (void)setFieldLabel:(NSString *)label {
    [_field setAccessibilityLabel:label];
}

- (void)setPlaceholder:(NSString *)placeholder {
    _placeholder = [placeholder copy];
    [self updatePlaceholder];
}

- (void)setPlaceholderColor:(NSColor *)color {
    _placeholderColor = color;
    [self updatePlaceholder];
}

- (void)updatePlaceholder {
    _field.placeholderAttributedString = [[NSAttributedString alloc]
        initWithString:_placeholder ?: @""
        attributes:@{NSForegroundColorAttributeName: _placeholderColor ?: NSColor.placeholderTextColor}];
}

- (void)setTextColor:(NSColor *)color {
    _field.textColor = color;
}

- (void)setValue:(NSString *)value {
    NSString *next = value ?: @"";
    if (![_field.stringValue isEqualToString:next]) {
        _field.stringValue = next;
    }
}

- (BOOL)control:(NSControl *)control textShouldBeginEditing:(NSText *)editor {
    [self reportFocus:YES];
    return YES;
}

- (void)controlTextDidEndEditing:(NSNotification *)notification {
    [self reportFocus:NO];
}

- (void)reportFocus:(BOOL)focused {
    if (self.onSecureFocus) {
        self.onSecureFocus(@{@"focused": @(focused)});
    }
}

- (void)controlTextDidChange:(NSNotification *)notification {
    NSString *text = _field.stringValue;
    if (self.maxLength > 0 && text.length > self.maxLength) {
        NSRange cluster = [text rangeOfComposedCharacterSequenceAtIndex:self.maxLength];
        text = [text substringToIndex:cluster.location];
        _field.stringValue = text;
    }
    if (self.onSecureChange) {
        self.onSecureChange(@{@"text": text});
    }
}

- (BOOL)control:(NSControl *)control textView:(NSTextView *)editor doCommandBySelector:(SEL)selector {
    if (selector == @selector(insertNewline:) && self.onSecureSubmit) {
        self.onSecureSubmit(@{});
        return YES;
    }
    return NO;
}

@end

@interface VizeSecureTextFieldManager : RCTViewManager
@end

@implementation VizeSecureTextFieldManager
RCT_EXPORT_MODULE(VizeSecureTextField)
RCT_EXPORT_VIEW_PROPERTY(fieldLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(placeholder, NSString)
RCT_EXPORT_VIEW_PROPERTY(value, NSString)
RCT_EXPORT_VIEW_PROPERTY(textColor, NSColor)
RCT_EXPORT_VIEW_PROPERTY(placeholderColor, NSColor)
RCT_EXPORT_VIEW_PROPERTY(maxLength, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(onSecureChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSecureFocus, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSecureSubmit, RCTBubblingEventBlock)

- (NSView *)view {
    return [[VizeSecureFieldView alloc] initWithFrame:NSZeroRect];
}
@end
