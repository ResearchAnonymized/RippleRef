package ai.refact.engine.analysis;

import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.dom.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AST-based code analyzer using Eclipse JDT Core.
 * This service provides accurate Java code analysis alongside the existing regex-based analysis.
 * 
 * Architecture: This is an ADDITIONAL service that complements existing analysis without breaking changes.
 */
@Service
public class ASTBasedAnalyzer {
    
    private static final Logger logger = LoggerFactory.getLogger(ASTBasedAnalyzer.class);
    
    public ASTBasedAnalyzer() {
        logger.info("ASTBasedAnalyzer initialized successfully");
    }
    
    /**
     * Analyze a Java file using AST parsing for accurate code understanding.
     * 
     * @param filePath Path to the Java file
     * @return ASTAnalysisResult containing detailed code analysis
     */
    public ASTAnalysisResult analyzeFile(Path filePath) {
        try {
            logger.info("Starting AST analysis for file: {}", filePath);
            
            // Read file content
            String sourceCode = Files.readString(filePath);
            
            // Create AST parser
            ASTParser parser = ASTParser.newParser(AST.JLS17);
            parser.setKind(ASTParser.K_COMPILATION_UNIT);
            parser.setSource(sourceCode.toCharArray());
            
            // Set up Java project environment
            Map<String, String> options = JavaCore.getOptions();
            options.put(JavaCore.COMPILER_SOURCE, JavaCore.VERSION_17);
            options.put(JavaCore.COMPILER_COMPLIANCE, JavaCore.VERSION_17);
            options.put(JavaCore.COMPILER_CODEGEN_TARGET_PLATFORM, JavaCore.VERSION_17);
            parser.setCompilerOptions(options);
            
            // Parse the source code
            CompilationUnit cu = (CompilationUnit) parser.createAST(null);
            
            // Analyze the AST
            ASTAnalysisResult result = new ASTAnalysisResult();
            result.setFilePath(filePath.toString());
            result.setFileName(filePath.getFileName().toString());
            
            // Visit all nodes in the AST
            cu.accept(new ASTVisitor() {
                @Override
                public boolean visit(TypeDeclaration node) {
                    analyzeTypeDeclaration(node, result);
                    return super.visit(node);
                }
                
                @Override
                public boolean visit(org.eclipse.jdt.core.dom.MethodDeclaration node) {
                    analyzeMethodDeclaration(node, result);
                    return super.visit(node);
                }
                
                @Override
                public boolean visit(ImportDeclaration node) {
                    analyzeImportDeclaration(node, result);
                    return super.visit(node);
                }
                
                @Override
                public boolean visit(MethodInvocation node) {
                    analyzeMethodInvocation(node, result);
                    return super.visit(node);
                }
                
                @Override
                public boolean visit(ClassInstanceCreation node) {
                    analyzeClassInstanceCreation(node, result);
                    return super.visit(node);
                }
                
                @Override
                public boolean visit(FieldDeclaration node) {
                    analyzeFieldDeclaration(node, result);
                    return super.visit(node);
                }
            });
            
            logger.info("AST analysis completed for file: {} - Found {} classes, {} methods, {} imports", 
                       filePath, result.getClassDeclarations().size(), 
                       result.getMethodDeclarations().size(), result.getImports().size());
            
            return result;
            
        } catch (IOException e) {
            logger.error("Error reading file for AST analysis: {}", filePath, e);
            return createErrorResult(filePath.toString(), e.getMessage());
        } catch (Exception e) {
            logger.error("Error during AST analysis: {}", filePath, e);
            return createErrorResult(filePath.toString(), e.getMessage());
        }
    }
    
    private void analyzeTypeDeclaration(TypeDeclaration node, ASTAnalysisResult result) {
        ClassDeclaration classDecl = new ClassDeclaration();
        classDecl.setName(node.getName().getIdentifier());
        classDecl.setLineNumber(node.getStartPosition());
        classDecl.setModifiers(node.getModifiers());
        
        // Analyze superclass
        if (node.getSuperclassType() != null) {
            classDecl.setSuperclass(getTypeName(node.getSuperclassType()));
        }
        
        // Analyze interfaces
        List<String> interfaces = new ArrayList<>();
        for (Object interfaceType : node.superInterfaceTypes()) {
            interfaces.add(getTypeName((Type) interfaceType));
        }
        classDecl.setInterfaces(interfaces);
        
        // Analyze annotations
        List<String> annotations = new ArrayList<>();
        for (Object annotation : node.modifiers()) {
            if (annotation instanceof Annotation) {
                annotations.add(((Annotation) annotation).getTypeName().getFullyQualifiedName());
            }
        }
        classDecl.setAnnotations(annotations);
        
        result.getClassDeclarations().add(classDecl);
    }
    
    private void analyzeMethodDeclaration(org.eclipse.jdt.core.dom.MethodDeclaration node, ASTAnalysisResult result) {
        MethodDeclaration methodDecl = new MethodDeclaration();
        methodDecl.setName(node.getName().getIdentifier());
        methodDecl.setLineNumber(node.getStartPosition());
        methodDecl.setModifiers(node.getModifiers());
        methodDecl.setReturnType(getTypeName(node.getReturnType2()));
        
        // Analyze parameters
        List<ParameterInfo> parameters = new ArrayList<>();
        for (Object param : node.parameters()) {
            SingleVariableDeclaration paramDecl = (SingleVariableDeclaration) param;
            ParameterInfo paramInfo = new ParameterInfo();
            paramInfo.setName(paramDecl.getName().getIdentifier());
            paramInfo.setType(getTypeName(paramDecl.getType()));
            paramInfo.setModifiers(paramDecl.getModifiers());
            parameters.add(paramInfo);
        }
        methodDecl.setParameters(parameters);
        
        // Analyze annotations
        List<String> annotations = new ArrayList<>();
        for (Object annotation : node.modifiers()) {
            if (annotation instanceof Annotation) {
                annotations.add(((Annotation) annotation).getTypeName().getFullyQualifiedName());
            }
        }
        methodDecl.setAnnotations(annotations);
        
        // Calculate complexity (simplified)
        int complexity = calculateCyclomaticComplexity(node);
        methodDecl.setComplexity(complexity);
        
        result.getMethodDeclarations().add(methodDecl);
    }
    
    private void analyzeImportDeclaration(ImportDeclaration node, ASTAnalysisResult result) {
        ImportInfo importInfo = new ImportInfo();
        importInfo.setName(node.getName().getFullyQualifiedName());
        importInfo.setStatic(node.isStatic());
        importInfo.setWildcard(node.isOnDemand());
        importInfo.setLineNumber(node.getStartPosition());
        
        result.getImports().add(importInfo);
    }
    
    private void analyzeMethodInvocation(MethodInvocation node, ASTAnalysisResult result) {
        MethodCallInfo methodCall = new MethodCallInfo();
        methodCall.setMethodName(node.getName().getIdentifier());
        methodCall.setLineNumber(node.getStartPosition());
        
        // Get the receiver (object on which method is called)
        if (node.getExpression() != null) {
            methodCall.setReceiver(getExpressionName(node.getExpression()));
        }
        
        // Analyze arguments
        List<String> arguments = new ArrayList<>();
        for (Object arg : node.arguments()) {
            arguments.add(getExpressionName((Expression) arg));
        }
        methodCall.setArguments(arguments);
        
        result.getMethodCalls().add(methodCall);
    }
    
    private void analyzeClassInstanceCreation(ClassInstanceCreation node, ASTAnalysisResult result) {
        ClassInstantiationInfo instantiation = new ClassInstantiationInfo();
        instantiation.setClassName(getTypeName(node.getType()));
        instantiation.setLineNumber(node.getStartPosition());
        
        // Analyze arguments
        List<String> arguments = new ArrayList<>();
        for (Object arg : node.arguments()) {
            arguments.add(getExpressionName((Expression) arg));
        }
        instantiation.setArguments(arguments);
        
        result.getClassInstantiations().add(instantiation);
    }
    
    private void analyzeFieldDeclaration(FieldDeclaration node, ASTAnalysisResult result) {
        for (Object fragment : node.fragments()) {
            VariableDeclarationFragment varDecl = (VariableDeclarationFragment) fragment;
            FieldInfo fieldInfo = new FieldInfo();
            fieldInfo.setName(varDecl.getName().getIdentifier());
            fieldInfo.setType(getTypeName(node.getType()));
            fieldInfo.setModifiers(node.getModifiers());
            fieldInfo.setLineNumber(node.getStartPosition());
            
            result.getFields().add(fieldInfo);
        }
    }
    
    private int calculateCyclomaticComplexity(org.eclipse.jdt.core.dom.MethodDeclaration node) {
        ComplexityVisitor visitor = new ComplexityVisitor();
        node.accept(visitor);
        return visitor.getComplexity();
    }
    
    private String getTypeName(Type type) {
        if (type == null) return "void";
        if (type.isPrimitiveType()) {
            return ((PrimitiveType) type).getPrimitiveTypeCode().toString();
        }
        if (type.isSimpleType()) {
            return ((SimpleType) type).getName().getFullyQualifiedName();
        }
        if (type.isParameterizedType()) {
            ParameterizedType paramType = (ParameterizedType) type;
            return getTypeName(paramType.getType()) + "<" + 
                   paramType.typeArguments().stream()
                   .map(t -> getTypeName((Type) t))
                   .collect(Collectors.joining(", ")) + ">";
        }
        if (type.isArrayType()) {
            ArrayType arrayType = (ArrayType) type;
            return getTypeName(arrayType.getElementType()) + "[]";
        }
        return type.toString();
    }
    
    private String getExpressionName(Expression expression) {
        if (expression instanceof SimpleName) {
            return ((SimpleName) expression).getIdentifier();
        }
        if (expression instanceof QualifiedName) {
            return ((QualifiedName) expression).getFullyQualifiedName();
        }
        if (expression instanceof ThisExpression) {
            return "this";
        }
        if (expression instanceof SuperFieldAccess) {
            return "super." + ((SuperFieldAccess) expression).getName().getIdentifier();
        }
        if (expression instanceof SuperMethodInvocation) {
            return "super." + ((SuperMethodInvocation) expression).getName().getIdentifier();
        }
        return expression.toString();
    }
    
    private ASTAnalysisResult createErrorResult(String filePath, String errorMessage) {
        ASTAnalysisResult result = new ASTAnalysisResult();
        result.setFilePath(filePath);
        result.setError(errorMessage);
        return result;
    }
    
    /**
     * Complexity visitor to calculate cyclomatic complexity
     */
    private static class ComplexityVisitor extends ASTVisitor {
        private int complexity = 1; // Base complexity
        
        @Override
        public boolean visit(IfStatement node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(WhileStatement node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(ForStatement node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(EnhancedForStatement node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(DoStatement node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(SwitchStatement node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(SwitchCase node) {
            if (!node.isDefault()) {
                complexity++;
            }
            return super.visit(node);
        }
        
        @Override
        public boolean visit(CatchClause node) {
            complexity++;
            return super.visit(node);
        }
        
        @Override
        public boolean visit(ConditionalExpression node) {
            complexity++;
            return super.visit(node);
        }
        
        public int getComplexity() {
            return complexity;
        }
    }
}
